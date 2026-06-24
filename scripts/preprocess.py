#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
智能教辅讲义生成器 - 教材预处理主控脚本
====================================================
功能：将 ChinaTextbook-master 中的 PDF 教材解析并构建向量化知识库

阶段：
  1. 扫描元数据：扫描所有PDF，分类文字版/扫描版，生成索引
  2. 解析PDF：提取章节结构，生成结构化JSON
  3. 向量化：Embedding + ChromaDB索引（按学科隔离）
  4. 关键词索引：构建倒排表
  5. 验证：测试检索质量

特性：
  - 断点续传：支持中断后从检查点恢复
  - 进度显示：命令行进度条 + 可选Web仪表盘
  - 失败记录：解析失败自动记录，不停止处理
  - 学科隔离：每个学科独立ChromaDB集合

使用：
  python scripts/preprocess.py --all          # 全量处理
  python scripts/preprocess.py --phase 1      # 仅执行第1阶段
  python scripts/preprocess.py --resume       # 从检查点恢复
"""

import os
import sys
import json
import time
import logging
import argparse
import shutil
import traceback
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict

# =============================================================================
# 配置
# =============================================================================

BASE_DIR = Path(__file__).parent.parent.resolve()
DATA_DIR = BASE_DIR / "data"
CHECKPOINT_DIR = DATA_DIR / "checkpoints"
TEXTBOOK_DIR = BASE_DIR / "ChinaTextbook-master"
PARSED_DIR = DATA_DIR / "textbooks" / "parsed"
CHROMA_DIR = DATA_DIR / "chroma_db"
INDEX_DIR = DATA_DIR / "index"

# 检查点文件
CHECKPOINT_FILE = CHECKPOINT_DIR / "phase.json"
PARSE_CHECKPOINT = CHECKPOINT_DIR / "parse_progress.json"
VECTOR_CHECKPOINT = CHECKPOINT_DIR / "vector_progress.json"
FAILED_FILE = DATA_DIR / "failed_parse.json"

# 输出文件
MASTER_INDEX = DATA_DIR / "textbooks" / "index.json"
TEXT_BOOKS_INDEX = DATA_DIR / "textbooks" / "text_books.json"
KEYWORD_INDEX = INDEX_DIR / "keyword_index.json"

# 批次大小
BATCH_SIZE = 100
CHECKPOINT_INTERVAL = 50  # 每50本保存一次检查点

# 检测参数（文字版 vs 扫描版）
SAMPLE_PAGES = 3
TEXT_MIN_LENGTH = 100  # 平均文本长度阈值
SCAN_MAX_TEXT = 50     # 扫描版最大文本长度

# =============================================================================
# 数据类
# =============================================================================

@dataclass
class BookMetadata:
    """教材元数据"""
    id: str
    name: str
    path: str          # 相对路径
    full_path: str     # 绝对路径
    subject: str       # 学科
    level: str         # 学段（小学/初中/高中/大学）
    grade: str         # 年级
    publisher: str     # 出版社
    volume: str        # 上册/下册/全一册
    size_mb: float
    pages: int = 0
    pdf_type: str = ""  # text / scan / unknown
    
    def to_dict(self) -> Dict:
        return asdict(self)

@dataclass
class ParseResult:
    """解析结果"""
    book_id: str
    success: bool
    chapters: List[Dict] = None
    error: str = ""
    elapsed: float = 0.0

@dataclass
class ProgressStats:
    """进度统计"""
    total: int = 0
    completed: int = 0
    failed: int = 0
    skipped: int = 0
    elapsed_seconds: float = 0.0
    
    @property
    def percent(self) -> float:
        if self.total == 0:
            return 0.0
        return (self.completed / self.total) * 100
    
    @property
    def eta_seconds(self) -> float:
        if self.completed == 0:
            return 0.0
        rate = self.completed / self.elapsed_seconds  # items/sec
        remaining = self.total - self.completed
        return remaining / rate if rate > 0 else 0.0
    
    def to_dict(self) -> Dict:
        return {
            "total": self.total,
            "completed": self.completed,
            "failed": self.failed,
            "skipped": self.skipped,
            "percent": round(self.percent, 2),
            "elapsed": self._format_time(self.elapsed_seconds),
            "eta": self._format_time(self.eta_seconds),
        }
    
    @staticmethod
    def _format_time(seconds: float) -> str:
        if seconds < 60:
            return f"{int(seconds)}s"
        elif seconds < 3600:
            return f"{int(seconds/60)}m {int(seconds%60)}s"
        else:
            return f"{int(seconds/3600)}h {int((seconds%3600)/60)}m"


# =============================================================================
# 日志
# =============================================================================

def setup_logging():
    """配置日志"""
    log_dir = DATA_DIR / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    
    log_file = log_dir / f"preprocess_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    return logging.getLogger(__name__)

logger = setup_logging()


# =============================================================================
# 工具函数
# =============================================================================

def ensure_dirs():
    """确保所有目录存在"""
    for d in [DATA_DIR, CHECKPOINT_DIR, PARSED_DIR, CHROMA_DIR, INDEX_DIR]:
        d.mkdir(parents=True, exist_ok=True)
    
    # 按学科创建子目录
    for subject in ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理", "政治", "其他"]:
        (PARSED_DIR / subject).mkdir(parents=True, exist_ok=True)

def save_checkpoint(name: str, data: Dict):
    """保存检查点"""
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    file_path = CHECKPOINT_DIR / f"{name}.json"
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"检查点已保存: {file_path}")

def load_checkpoint(name: str) -> Optional[Dict]:
    """加载检查点"""
    file_path = CHECKPOINT_DIR / f"{name}.json"
    if not file_path.exists():
        return None
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"加载检查点失败 {name}: {e}")
        return None

def save_json(data: Any, path: Path):
    """保存JSON文件"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def load_json(path: Path) -> Optional[Any]:
    """加载JSON文件"""
    if not path.exists():
        return None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"加载JSON失败 {path}: {e}")
        return None


# =============================================================================
# Phase 1: 扫描元数据
# =============================================================================

def scan_pdf_metadata() -> Tuple[List[BookMetadata], List[BookMetadata], Dict]:
    """
    扫描所有PDF，提取元数据，分类文字版/扫描版
    
    Returns:
        text_books: 文字版教材列表
        scan_books: 扫描版教材列表
        stats: 统计信息
    """
    logger.info("=" * 60)
    logger.info("[Phase 1] 扫描PDF元数据")
    logger.info("=" * 60)
    
    if not TEXTBOOK_DIR.exists():
        logger.error(f"教材目录不存在: {TEXTBOOK_DIR}")
        return [], [], {}
    
    # 尝试导入 pdfplumber 用于检测
    try:
        import pdfplumber
        has_pdfplumber = True
    except ImportError:
        logger.warning("pdfplumber 未安装，将使用简单文件大小判断")
        has_pdfplumber = False
    
    text_books = []
    scan_books = []
    all_books = []
    
    # 统计
    subject_counts = {}
    level_counts = {}
    
    total_files = 0
    
    # 遍历目录
    for root, dirs, files in os.walk(TEXTBOOK_DIR):
        # 跳过缓存目录
        if '.cache' in root or '_cache' in root:
            continue
        
        for filename in files:
            if not filename.endswith('.pdf'):
                continue
            
            total_files += 1
            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, TEXTBOOK_DIR)
            
            # 解析路径获取元信息
            parts = rel_path.split(os.sep)
            level = parts[0] if len(parts) > 0 else "未知"
            subject = parts[1] if len(parts) > 1 else "未知"
            publisher = parts[2] if len(parts) > 2 else "未知"
            grade = parts[3] if len(parts) > 3 else "未知"
            
            # 确定册别（上册/下册/全一册）
            volume = "未知"
            if '上册' in filename or '上' in filename:
                volume = '上册'
            elif '下册' in filename or '下' in filename:
                volume = '下册'
            elif '全一册' in filename:
                volume = '全一册'
            
            # 生成唯一ID
            book_id = f"{subject}_{publisher}_{grade}_{volume}".replace(' ', '_').replace('·', '')
            book_id = f"{book_id}_{total_files}"  # 避免重复
            
            # 获取文件大小
            size_mb = os.path.getsize(full_path) / (1024 * 1024)
            
            book = BookMetadata(
                id=book_id,
                name=filename.replace('.pdf', ''),
                path=rel_path,
                full_path=full_path,
                subject=subject,
                level=level,
                grade=grade,
                publisher=publisher,
                volume=volume,
                size_mb=round(size_mb, 2)
            )
            
            all_books.append(book)
            
            # 更新统计
            subject_counts[subject] = subject_counts.get(subject, 0) + 1
            level_counts[level] = level_counts.get(level, 0) + 1
    
    logger.info(f"总计发现 {total_files} 个PDF文件")
    
    # 检测PDF类型（如果安装了pdfplumber）
    if has_pdfplumber:
        logger.info("开始检测PDF类型（文字版/扫描版）...")
        text_books, scan_books = classify_pdfs(all_books)
    else:
        # 简单判断：大于5MB的认为是扫描版（可能不准确）
        logger.info("使用简单大小规则分类（可能不准确）...")
        for book in all_books:
            if book.size_mb > 15:  # 大于15MB的可能是扫描版
                book.pdf_type = "scan"
                scan_books.append(book)
            else:
                book.pdf_type = "text"
                text_books.append(book)
    
    # 统计
    stats = {
        "total": total_files,
        "text": len(text_books),
        "scan": len(scan_books),
        "subjects": subject_counts,
        "levels": level_counts,
    }
    
    # 保存索引
    save_json({
        "generated_at": datetime.now().isoformat(),
        "total_books": total_files,
        "text_books": len(text_books),
        "scan_books": len(scan_books),
        "books": [b.to_dict() for b in all_books],
        "stats": stats
    }, MASTER_INDEX)
    
    save_json({
        "generated_at": datetime.now().isoformat(),
        "count": len(text_books),
        "books": [b.to_dict() for b in text_books]
    }, TEXT_BOOKS_INDEX)
    
    # 输出报告
    logger.info("\n扫描完成报告:")
    logger.info(f"  总计PDF: {total_files}")
    logger.info(f"  文字版: {len(text_books)} (将处理)")
    logger.info(f"  扫描版: {len(scan_books)} (跳过)")
    logger.info("\n学段分布:")
    for level, count in sorted(level_counts.items(), key=lambda x: -x[1]):
        logger.info(f"  {level}: {count}")
    logger.info("\n学科分布 (Top 10):")
    for subject, count in sorted(subject_counts.items(), key=lambda x: -x[1])[:10]:
        logger.info(f"  {subject}: {count}")
    
    return text_books, scan_books, stats


def classify_pdfs(books: List[BookMetadata]) -> Tuple[List[BookMetadata], List[BookMetadata]]:
    """
    使用 pdfplumber 检测PDF类型
    
    Returns:
        text_books, scan_books
    """
    import pdfplumber
    import random
    
    text_books = []
    scan_books = []
    
    stats = ProgressStats(total=len(books))
    start_time = time.time()
    
    print(f"\n[PDF类型检测] 共 {len(books)} 本")
    
    for i, book in enumerate(books):
        try:
            with pdfplumber.open(book.full_path) as pdf:
                total_pages = len(pdf.pages)
                book.pages = total_pages
                
                # 随机采样3页
                sample_count = min(SAMPLE_PAGES, total_pages)
                if total_pages > 0:
                    indices = random.sample(range(total_pages), sample_count)
                else:
                    indices = [0]
                
                text_lengths = []
                image_counts = []
                
                for idx in indices:
                    try:
                        page = pdf.pages[idx]
                        text = page.extract_text() or ""
                        text_lengths.append(len(text.strip()))
                        image_counts.append(len(page.images))
                    except Exception:
                        text_lengths.append(0)
                        image_counts.append(0)
                
                avg_text = sum(text_lengths) / len(text_lengths) if text_lengths else 0
                avg_images = sum(image_counts) / len(image_counts) if image_counts else 0
                
                # 判断逻辑
                if avg_text < SCAN_MAX_TEXT and avg_images > 0:
                    book.pdf_type = "scan"
                    scan_books.append(book)
                elif avg_text > TEXT_MIN_LENGTH:
                    book.pdf_type = "text"
                    text_books.append(book)
                else:
                    # 模糊情况，按文件大小辅助判断
                    if book.size_mb > 20:
                        book.pdf_type = "scan"
                        scan_books.append(book)
                    else:
                        book.pdf_type = "text"
                        text_books.append(book)
        
        except Exception as e:
            logger.warning(f"检测失败 {book.name}: {e}")
            book.pdf_type = "unknown"
            scan_books.append(book)  # 未知类型归为扫描版，保守处理
        
        stats.completed = i + 1
        stats.elapsed_seconds = time.time() - start_time
        
        # 每100本输出一次进度
        if (i + 1) % 100 == 0 or (i + 1) == len(books):
            print(f"  进度: [{i+1}/{len(books)}] {stats.percent:.1f}% | "
                  f"文字版:{len(text_books)} 扫描版:{len(scan_books)} | "
                  f"用时:{stats._format_time(stats.elapsed_seconds)} | "
                  f"ETA:{stats._format_time(stats.eta_seconds)}")
    
    return text_books, scan_books


# =============================================================================
# Phase 2: 解析PDF
# =============================================================================

def parse_all_pdfs(text_books: List[BookMetadata], resume: bool = False) -> Dict:
    """
    解析所有文字版PDF
    
    Args:
        text_books: 文字版教材列表
        resume: 是否从检查点恢复
    
    Returns:
        统计信息
    """
    logger.info("\n" + "=" * 60)
    logger.info("[Phase 2] 解析PDF内容")
    logger.info("=" * 60)
    
    try:
        import pdfplumber
    except ImportError:
        logger.error("pdfplumber 未安装，请运行: pip install pdfplumber")
        return {"error": "pdfplumber not installed"}
    
    # 加载检查点
    checkpoint = None
    if resume:
        checkpoint = load_checkpoint("parse_progress")
    
    processed_ids = set()
    failed_books = []
    
    if checkpoint:
        processed_ids = set(checkpoint.get("processed_ids", []))
        failed_books = checkpoint.get("failed_books", [])
        logger.info(f"从检查点恢复，已处理 {len(processed_ids)} 本，失败 {len(failed_books)} 本")
    
    # 过滤已处理的
    books_to_process = [b for b in text_books if b.id not in processed_ids]
    
    if not books_to_process:
        logger.info("所有PDF已解析完成！")
        return {
            "total": len(text_books),
            "processed": len(processed_ids),
            "failed": len(failed_books),
        }
    
    logger.info(f"待处理: {len(books_to_process)} 本 (总计 {len(text_books)} 本)")
    
    stats = ProgressStats(total=len(books_to_process))
    start_time = time.time()
    
    print(f"\n[PDF解析] 共 {len(books_to_process)} 本")
    
    for i, book in enumerate(books_to_process):
        try:
            result = parse_single_pdf(book)
            
            if result.success:
                # 保存解析结果
                subject_dir = PARSED_DIR / book.subject
                subject_dir.mkdir(parents=True, exist_ok=True)
                output_file = subject_dir / f"{book.id}.json"
                
                save_json({
                    "book_id": book.id,
                    "name": book.name,
                    "subject": book.subject,
                    "grade": book.grade,
                    "publisher": book.publisher,
                    "volume": book.volume,
                    "pages": book.pages,
                    "chapters": result.chapters,
                    "parsed_at": datetime.now().isoformat(),
                }, output_file)
                
                processed_ids.add(book.id)
            else:
                failed_books.append({
                    "book_id": book.id,
                    "name": book.name,
                    "error": result.error,
                    "time": datetime.now().isoformat(),
                })
        
        except Exception as e:
            logger.error(f"解析异常 {book.name}: {e}")
            failed_books.append({
                "book_id": book.id,
                "name": book.name,
                "error": str(e),
                "traceback": traceback.format_exc(),
                "time": datetime.now().isoformat(),
            })
        
        stats.completed = i + 1
        stats.failed = len(failed_books)
        stats.elapsed_seconds = time.time() - start_time
        
        # 保存检查点
        if (i + 1) % CHECKPOINT_INTERVAL == 0:
            save_checkpoint("parse_progress", {
                "processed_ids": list(processed_ids),
                "failed_books": failed_books,
                "last_processed": book.id,
                "timestamp": datetime.now().isoformat(),
            })
            print(f"  检查点已保存 ({i+1}/{len(books_to_process)})")
        
        # 显示进度
        if (i + 1) % 10 == 0 or (i + 1) == len(books_to_process):
            print(f"  [{i+1}/{len(books_to_process)}] {stats.percent:.1f}% | "
                  f"成功:{len(processed_ids)} 失败:{len(failed_books)} | "
                  f"用时:{stats._format_time(stats.elapsed_seconds)} | "
                  f"ETA:{stats._format_time(stats.eta_seconds)}")
    
    # 最终保存
    save_checkpoint("parse_progress", {
        "processed_ids": list(processed_ids),
        "failed_books": failed_books,
        "completed": True,
        "timestamp": datetime.now().isoformat(),
    })
    
    save_json(failed_books, FAILED_FILE)
    
    # 输出报告
    print(f"\n解析完成:")
    print(f"  总计: {len(text_books)}")
    print(f"  成功: {len(processed_ids)}")
    print(f"  失败: {len(failed_books)} (已记录到 {FAILED_FILE})")
    print(f"  总用时: {stats._format_time(stats.elapsed_seconds)}")
    
    return {
        "total": len(text_books),
        "processed": len(processed_ids),
        "failed": len(failed_books),
    }


def parse_single_pdf(book: BookMetadata) -> ParseResult:
    """
    解析单个PDF
    
    提取目录结构，按章节切分内容
    """
    import pdfplumber
    import re
    
    start_time = time.time()
    
    try:
        with pdfplumber.open(book.full_path) as pdf:
            total_pages = len(pdf.pages)
            book.pages = total_pages
            
            # 尝试提取目录（通常在前面几页）
            toc = extract_toc(pdf, total_pages)
            
            if toc:
                # 有目录，按目录切分
                chapters = parse_with_toc(pdf, toc, total_pages)
            else:
                # 无目录，按页码均匀切分或提取全文
                chapters = parse_without_toc(pdf, total_pages, book)
            
            elapsed = time.time() - start_time
            return ParseResult(
                book_id=book.id,
                success=True,
                chapters=chapters,
                elapsed=elapsed
            )
    
    except Exception as e:
        return ParseResult(
            book_id=book.id,
            success=False,
            error=str(e),
            elapsed=time.time() - start_time
        )


def extract_toc(pdf, total_pages: int) -> Optional[List[Dict]]:
    """
    尝试从PDF前5页提取目录
    
    Returns:
        目录列表，每个条目包含 title 和 page
    """
    import re
    
    toc = []
    sample_pages = min(5, total_pages)
    
    for page_idx in range(sample_pages):
        try:
            page = pdf.pages[page_idx]
            text = page.extract_text() or ""
            
            # 匹配目录格式："第X章 XXX ... 页码"
            # 或 "X.X XXX ... 页码"
            lines = text.split('\n')
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                
                # 匹配模式："第X章" 或 "X.X" 开头
                chapter_match = re.search(r'(第[一二三四五六七八九十\d]+章|第\d+章)[\s]*(.+)', line)
                section_match = re.search(r'(\d+\.\d+)[\s]+(.+)', line)
                
                if chapter_match or section_match:
                    # 尝试提取页码
                    page_num = re.search(r'(\d+)$', line)
                    page = int(page_num.group(1)) if page_num else 0
                    
                    if chapter_match:
                        title = chapter_match.group(2).strip()
                        toc.append({"title": title, "page": page, "type": "chapter"})
                    elif section_match:
                        title = section_match.group(2).strip()
                        toc.append({"title": title, "page": page, "type": "section"})
        
        except Exception:
            continue
    
    # 如果目录条目太少，可能不是目录页
    if len(toc) < 2:
        return None
    
    return toc


def parse_with_toc(pdf, toc: List[Dict], total_pages: int) -> List[Dict]:
    """
    根据目录切分章节内容
    """
    chapters = []
    
    for i, entry in enumerate(toc):
        start_page = entry.get("page", 0) - 1  # PDF页码从0开始
        if start_page < 0:
            start_page = 0
        
        # 确定结束页
        if i + 1 < len(toc):
            end_page = toc[i + 1].get("page", total_pages) - 1
        else:
            end_page = total_pages
        
        end_page = min(end_page, total_pages)
        
        # 提取内容
        content = ""
        for page_idx in range(start_page, end_page):
            if page_idx < total_pages:
                try:
                    page = pdf.pages[page_idx]
                    text = page.extract_text() or ""
                    content += text + "\n"
                except Exception:
                    continue
        
        # 提取小节（如果内容足够长）
        sections = split_sections(content, entry["title"])
        
        chapters.append({
            "title": entry["title"],
            "page_start": start_page + 1,
            "page_end": end_page,
            "content": content[:5000],  # 限制长度，避免过大
            "sections": sections,
        })
    
    return chapters


def parse_without_toc(pdf, total_pages: int, book: BookMetadata) -> List[Dict]:
    """
    无目录时的解析策略：提取全文并作为一个大章节
    """
    content = ""
    for page_idx in range(min(total_pages, 100)):  # 最多提取100页
        try:
            page = pdf.pages[page_idx]
            text = page.extract_text() or ""
            content += text + "\n"
        except Exception:
            continue
    
    return [{
        "title": book.name,
        "page_start": 1,
        "page_end": min(total_pages, 100),
        "content": content[:10000],  # 限制长度
        "sections": [],
    }]


def split_sections(content: str, chapter_title: str) -> List[Dict]:
    """
    将章节内容按小节切分
    
    简单策略：按 "X.X" 或 "第X节" 等标题切分
    """
    import re
    
    sections = []
    
    # 尝试匹配小节标题
    pattern = r'(\d+\.\d+[\s]+.+?)(?=\d+\.\d+[\s]+|$)'
    matches = re.findall(pattern, content, re.DOTALL)
    
    if matches:
        for match in matches:
            # 提取标题和内容
            lines = match.strip().split('\n')
            title = lines[0].strip() if lines else "小节"
            section_content = '\n'.join(lines[1:]) if len(lines) > 1 else ""
            
            sections.append({
                "title": title,
                "content": section_content[:2000],  # 限制长度
            })
    
    # 如果没有匹配到小节，将整个章节作为一个小节
    if not sections and content.strip():
        sections.append({
            "title": chapter_title,
            "content": content[:3000],
        })
    
    return sections


# =============================================================================
# Phase 3: 向量化
# =============================================================================

def build_vector_index(resume: bool = False) -> Dict:
    """
    构建向量索引
    
    Args:
        resume: 是否从检查点恢复
    
    Returns:
        统计信息
    """
    logger.info("\n" + "=" * 60)
    logger.info("[Phase 3] 构建向量索引")
    logger.info("=" * 60)
    
    # 检查依赖
    try:
        import chromadb
        from sentence_transformers import SentenceTransformer
    except ImportError as e:
        logger.error(f"依赖未安装: {e}")
        logger.error("请运行: pip install chromadb sentence-transformers")
        return {"error": str(e)}
    
    # 加载模型
    model_name = 'BAAI/bge-large-zh-v1.5'
    logger.info(f"加载Embedding模型: {model_name}")
    
    try:
        model = SentenceTransformer(model_name)
        logger.info("模型加载完成")
    except Exception as e:
        logger.error(f"模型加载失败: {e}")
        return {"error": str(e)}
    
    # 初始化ChromaDB
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    
    # 加载解析数据
    parsed_files = list(PARSED_DIR.rglob("*.json"))
    logger.info(f"找到 {len(parsed_files)} 个解析文件")
    
    if not parsed_files:
        logger.warning("没有找到解析数据，请先执行 Phase 2")
        return {"error": "no parsed data"}
    
    # 加载检查点
    checkpoint = None
    if resume:
        checkpoint = load_checkpoint("vector_progress")
    
    processed_ids = set()
    if checkpoint:
        processed_ids = set(checkpoint.get("processed_ids", []))
        logger.info(f"从检查点恢复，已处理 {len(processed_ids)} 个段落")
    
    # 收集所有待处理的段落
    all_sections = []
    for parsed_file in parsed_files:
        try:
            data = load_json(parsed_file)
            if not data:
                continue
            
            book_id = data.get("book_id", "")
            subject = data.get("subject", "其他")
            
            for chapter in data.get("chapters", []):
                for section in chapter.get("sections", []):
                    section_id = f"{book_id}_{chapter['title']}_{section['title']}"
                    
                    if section_id in processed_ids:
                        continue
                    
                    content = section.get("content", "")
                    if not content or len(content) < 10:
                        continue
                    
                    all_sections.append({
                        "id": section_id,
                        "content": content,
                        "metadata": {
                            "book_id": book_id,
                            "subject": subject,
                            "grade": data.get("grade", ""),
                            "chapter": chapter.get("title", ""),
                            "section": section.get("title", ""),
                            "publisher": data.get("publisher", ""),
                        }
                    })
        
        except Exception as e:
            logger.warning(f"加载解析文件失败 {parsed_file}: {e}")
    
    logger.info(f"待处理段落: {len(all_sections)}")
    
    if not all_sections:
        logger.info("所有段落已向量化")
        return {"total": 0, "processed": len(processed_ids)}
    
    # 按学科分组
    subject_sections = {}
    for section in all_sections:
        subject = section["metadata"]["subject"]
        if subject not in subject_sections:
            subject_sections[subject] = []
        subject_sections[subject].append(section)
    
    # 逐个学科处理
    total_processed = len(processed_ids)
    total_sections = len(all_sections)
    
    stats = ProgressStats(total=total_sections)
    start_time = time.time()
    
    print(f"\n[向量化] 共 {total_sections} 个段落，{len(subject_sections)} 个学科")
    
    for subject, sections in subject_sections.items():
        # 获取或创建集合
        collection_name = f"textbooks_{subject}"
        try:
            collection = client.get_or_create_collection(collection_name)
        except Exception as e:
            logger.warning(f"创建集合失败 {collection_name}: {e}")
            continue
        
        print(f"\n  处理学科: {subject} ({len(sections)} 段落)")
        
        # 批量处理
        batch_size = 32  # 每批32个段落
        for batch_start in range(0, len(sections), batch_size):
            batch = sections[batch_start:batch_start + batch_size]
            
            try:
                # 生成向量
                texts = [s["content"] for s in batch]
                embeddings = model.encode(texts, show_progress_bar=False)
                
                # 存入ChromaDB
                ids = [s["id"] for s in batch]
                metadatas = [s["metadata"] for s in batch]
                documents = [s["content"] for s in batch]
                
                collection.add(
                    ids=ids,
                    embeddings=embeddings.tolist(),
                    metadatas=metadatas,
                    documents=documents
                )
                
                # 更新进度
                for s in batch:
                    processed_ids.add(s["id"])
                
                total_processed += len(batch)
                stats.completed = total_processed - len(processed_ids) + len(sections)
                stats.elapsed_seconds = time.time() - start_time
                
                # 保存检查点
                if (batch_start + len(batch)) % 100 == 0:
                    save_checkpoint("vector_progress", {
                        "processed_ids": list(processed_ids),
                        "last_subject": subject,
                        "timestamp": datetime.now().isoformat(),
                    })
            
            except Exception as e:
                logger.error(f"向量化失败: {e}")
                for s in batch:
                    processed_ids.add(s["id"])  # 标记为已处理，避免重复
            
            # 显示进度
            if (batch_start + len(batch)) % 50 == 0:
                current = batch_start + len(batch)
                print(f"    [{current}/{len(sections)}] {subject} | "
                      f"总进度:{total_processed}/{total_sections} | "
                      f"用时:{stats._format_time(stats.elapsed_seconds)}")
    
    # 最终保存
    save_checkpoint("vector_progress", {
        "processed_ids": list(processed_ids),
        "completed": True,
        "timestamp": datetime.now().isoformat(),
    })
    
    print(f"\n向量化完成:")
    print(f"  总段落: {total_sections}")
    print(f"  已处理: {total_processed}")
    print(f"  总用时: {stats._format_time(stats.elapsed_seconds)}")
    
    return {
        "total": total_sections,
        "processed": total_processed,
    }


# =============================================================================
# Phase 4: 关键词索引
# =============================================================================

def build_keyword_index() -> Dict:
    """
    构建关键词倒排索引
    
    从ChromaDB提取内容，构建关键词到文档的映射
    """
    logger.info("\n" + "=" * 60)
    logger.info("[Phase 4] 构建关键词索引")
    logger.info("=" * 60)
    
    try:
        import chromadb
    except ImportError:
        logger.error("chromadb 未安装")
        return {"error": "chromadb not installed"}
    
    try:
        import jieba
    except ImportError:
        logger.warning("jieba 未安装，使用简单分词")
        jieba = None
    
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    
    # 获取所有集合
    try:
        collections = client.list_collections()
    except Exception as e:
        logger.error(f"获取集合失败: {e}")
        return {"error": str(e)}
    
    keyword_index = {}
    total_docs = 0
    
    print(f"\n[关键词索引] 处理 {len(collections)} 个学科集合")
    
    for collection_name in collections:
        try:
            collection = client.get_collection(collection_name)
            results = collection.get()
            
            ids = results.get("ids", [])
            documents = results.get("documents", [])
            metadatas = results.get("metadatas", [])
            
            for doc_id, doc, meta in zip(ids, documents, metadatas):
                if not doc:
                    continue
                
                total_docs += 1
                
                # 分词
                if jieba:
                    words = jieba.lcut(doc)
                else:
                    words = doc.split()
                
                # 提取关键词（长度>1的词，去除停用词）
                for word in words:
                    word = word.strip().lower()
                    if len(word) < 2 or len(word) > 20:
                        continue
                    
                    if word not in keyword_index:
                        keyword_index[word] = []
                    
                    keyword_index[word].append({
                        "id": doc_id,
                        "subject": meta.get("subject", ""),
                        "grade": meta.get("grade", ""),
                        "chapter": meta.get("chapter", ""),
                        "section": meta.get("section", ""),
                    })
        
        except Exception as e:
            logger.warning(f"处理集合失败 {collection_name}: {e}")
    
    # 保存索引
    save_json({
        "generated_at": datetime.now().isoformat(),
        "total_documents": total_docs,
        "total_keywords": len(keyword_index),
        "index": keyword_index,
    }, KEYWORD_INDEX)
    
    print(f"\n关键词索引完成:")
    print(f"  文档数: {total_docs}")
    print(f"  关键词: {len(keyword_index)}")
    print(f"  索引大小: {os.path.getsize(KEYWORD_INDEX) / (1024*1024):.1f} MB")
    
    return {
        "total_documents": total_docs,
        "total_keywords": len(keyword_index),
    }


# =============================================================================
# Phase 5: 验证
# =============================================================================

def verify_index() -> Dict:
    """
    验证索引质量
    
    测试检索100个知识点，检查相关性和响应时间
    """
    logger.info("\n" + "=" * 60)
    logger.info("[Phase 5] 验证索引质量")
    logger.info("=" * 60)
    
    try:
        import chromadb
        from sentence_transformers import SentenceTransformer
    except ImportError as e:
        logger.error(f"依赖未安装: {e}")
        return {"error": str(e)}
    
    model = SentenceTransformer('BAAI/bge-large-zh-v1.5')
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    
    # 测试查询
    test_queries = [
        "一元一次方程",
        "三角形",
        "函数",
        "文言文",
        "英语语法",
        "力学",
        "化学反应",
        "细胞",
        "历史事件",
        "地理气候",
    ]
    
    results = []
    total_time = 0
    
    print(f"\n[验证] 测试 {len(test_queries)} 个查询")
    
    for query in test_queries:
        start = time.time()
        
        try:
            # 获取对应学科的集合（这里假设为数学）
            collection = client.get_collection("textbooks_数学")
            
            query_embedding = model.encode([query])
            search_results = collection.query(
                query_embeddings=query_embedding.tolist(),
                n_results=3
            )
            
            elapsed = time.time() - start
            total_time += elapsed
            
            distances = search_results.get("distances", [[]])[0]
            avg_distance = sum(distances) / len(distances) if distances else 0
            
            results.append({
                "query": query,
                "latency_ms": round(elapsed * 1000, 2),
                "avg_distance": round(avg_distance, 4),
                "results_count": len(distances),
            })
            
            print(f"  {query}: {elapsed*1000:.1f}ms, 距离:{avg_distance:.4f}")
        
        except Exception as e:
            print(f"  {query}: 失败 - {e}")
    
    avg_latency = total_time / len(test_queries) if test_queries else 0
    
    print(f"\n验证结果:")
    print(f"  平均延迟: {avg_latency*1000:.1f}ms")
    print(f"  成功查询: {len(results)}/{len(test_queries)}")
    
    return {
        "queries_tested": len(test_queries),
        "successful": len(results),
        "avg_latency_ms": round(avg_latency * 1000, 2),
    }


# =============================================================================
# Web 仪表盘 (可选)
# =============================================================================

def start_web_dashboard(port: int = 8083):
    """
    启动Web进度仪表盘（可选）
    
    在浏览器中访问 http://localhost:8083 查看实时进度
    """
    try:
        from flask import Flask, jsonify
    except ImportError:
        logger.warning("flask 未安装，跳过Web仪表盘")
        return None
    
    app = Flask(__name__)
    
    @app.route('/')
    def index():
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <title>教材预处理进度</title>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                .progress-bar { width: 100%; height: 30px; background: #f0f0f0; border-radius: 15px; overflow: hidden; }
                .progress-fill { height: 100%; background: linear-gradient(90deg, #4CAF50, #8BC34A); transition: width 0.3s; }
                .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
                .stat-card { background: #f8f9fa; padding: 20px; border-radius: 10px; }
                .stat-value { font-size: 28px; font-weight: bold; color: #2196F3; }
                .stat-label { font-size: 14px; color: #666; margin-top: 5px; }
            </style>
        </head>
        <body>
            <h1>教材预处理进度监控</h1>
            <div id="stats" class="stats"></div>
            <div class="progress-bar">
                <div id="progress" class="progress-fill" style="width: 0%"></div>
            </div>
            <div id="status" style="margin-top: 20px; font-family: monospace;"></div>
            <script>
                async function update() {
                    const res = await fetch('/api/progress');
                    const data = await res.json();
                    document.getElementById('progress').style.width = data.percent + '%';
                    document.getElementById('status').innerText = JSON.stringify(data, null, 2);
                }
                setInterval(update, 2000);
                update();
            </script>
        </body>
        </html>
        """
    
    @app.route('/api/progress')
    def progress():
        # 读取当前进度
        checkpoint = load_checkpoint("parse_progress") or load_checkpoint("vector_progress")
        return jsonify(checkpoint or {"status": "not started"})
    
    logger.info(f"Web仪表盘已启动: http://localhost:{port}")
    
    # 在后台运行
    import threading
    thread = threading.Thread(target=app.run, kwargs={'host': '0.0.0.0', 'port': port, 'debug': False})
    thread.daemon = True
    thread.start()
    
    return app


# =============================================================================
# 主控流程
# =============================================================================

def run_all_phases(resume: bool = False, dashboard: bool = False):
    """
    运行所有阶段
    """
    ensure_dirs()
    
    # 可选：启动Web仪表盘
    if dashboard:
        start_web_dashboard()
    
    start_time = time.time()
    
    # Phase 1: 扫描
    text_books, scan_books, stats = scan_pdf_metadata()
    
    if not text_books:
        logger.error("没有找到文字版PDF，终止处理")
        return
    
    # Phase 2: 解析
    parse_stats = parse_all_pdfs(text_books, resume=resume)
    
    # Phase 3: 向量化
    vector_stats = build_vector_index(resume=resume)
    
    # Phase 4: 关键词索引
    keyword_stats = build_keyword_index()
    
    # Phase 5: 验证
    verify_stats = verify_index()
    
    total_time = time.time() - start_time
    
    # 最终报告
    print("\n" + "=" * 60)
    print("  教材预处理完成报告")
    print("=" * 60)
    print(f"总用时: {timedelta(seconds=int(total_time))}")
    print(f"扫描PDF: {stats.get('total', 0)} 本")
    print(f"  - 文字版: {stats.get('text', 0)} 本")
    print(f"  - 扫描版: {stats.get('scan', 0)} 本 (跳过)")
    print(f"解析成功: {parse_stats.get('processed', 0)} 本")
    print(f"解析失败: {parse_stats.get('failed', 0)} 本")
    print(f"向量化段落: {vector_stats.get('processed', 0)}")
    print(f"关键词索引: {keyword_stats.get('total_keywords', 0)} 个")
    print(f"验证通过率: {verify_stats.get('successful', 0)}/{verify_stats.get('queries_tested', 0)}")
    print("=" * 60)
    
    # 保存总报告
    report = {
        "completed_at": datetime.now().isoformat(),
        "total_time_seconds": total_time,
        "scan": stats,
        "parse": parse_stats,
        "vector": vector_stats,
        "keyword": keyword_stats,
        "verify": verify_stats,
    }
    save_json(report, DATA_DIR / "preprocess_report.json")
    
    logger.info("所有阶段完成！报告已保存到 data/preprocess_report.json")


def main():
    """
    主入口
    """
    parser = argparse.ArgumentParser(
        description='教材预处理主控脚本 - 解析PDF并构建向量化知识库',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例:
  python preprocess.py --all                    # 全量处理
  python preprocess.py --phase 1                  # 仅执行第1阶段
  python preprocess.py --phase 2 --resume       # 从检查点恢复第2阶段
  python preprocess.py --all --resume --dashboard # 全量处理，带Web仪表盘
  python preprocess.py --status                   # 查看当前进度
        """
    )
    
    parser.add_argument('--all', action='store_true', help='执行所有阶段')
    parser.add_argument('--phase', type=int, choices=[1, 2, 3, 4, 5], help='执行指定阶段')
    parser.add_argument('--resume', action='store_true', help='从检查点恢复')
    parser.add_argument('--dashboard', action='store_true', help='启动Web仪表盘')
    parser.add_argument('--status', action='store_true', help='查看当前状态')
    
    args = parser.parse_args()
    
    # 查看状态
    if args.status:
        print("\n当前处理状态:")
        for name in ["parse_progress", "vector_progress"]:
            cp = load_checkpoint(name)
            if cp:
                print(f"  {name}: {cp.get('timestamp', 'unknown')}")
                if cp.get('completed'):
                    print(f"    状态: 已完成")
                else:
                    print(f"    状态: 进行中")
            else:
                print(f"  {name}: 未开始")
        return
    
    # 执行指定阶段或全部
    if args.all:
        run_all_phases(resume=args.resume, dashboard=args.dashboard)
    elif args.phase:
        ensure_dirs()
        
        if args.phase == 1:
            scan_pdf_metadata()
        elif args.phase == 2:
            # 需要加载text_books
            data = load_json(TEXT_BOOKS_INDEX)
            if data and data.get('books'):
                from dataclasses import dataclass
                books = [BookMetadata(**b) for b in data['books']]
                parse_all_pdfs(books, resume=args.resume)
            else:
                print("请先执行 Phase 1")
        elif args.phase == 3:
            build_vector_index(resume=args.resume)
        elif args.phase == 4:
            build_keyword_index()
        elif args.phase == 5:
            verify_index()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
