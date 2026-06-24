#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
教材检索服务（常驻进程）
=====================
通过 stdio 与 Node.js 通信，提供教材内容检索。

通信协议（JSON，每行一个消息）：
  请求: {"action": "search", "topic": "知识点", "subject": "学科", "grade": "年级", "top_k": 3}
  响应: {"status": "success", "results": [{"content": "...", "metadata": {...}, "distance": 0.12}]}

启动方式：
  python scripts/search_textbook.py

退出方式：发送 {"action": "exit"}
"""

import os
import sys
import json
import time
import logging
from pathlib import Path

# 配置日志（不输出到stdout，避免干扰JSON通信）
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(
            Path(__file__).parent.parent / "data" / "logs" / "search_service.log",
            encoding='utf-8'
        )
    ]
)
logger = logging.getLogger(__name__)

# 数据路径
BASE_DIR = Path(__file__).parent.parent.resolve()
CHROMA_DIR = BASE_DIR / "data" / "chroma_db"

def load_model():
    """加载 Embedding 模型"""
    from sentence_transformers import SentenceTransformer
    
    model_name = 'BAAI/bge-large-zh-v1.5'
    logger.info(f"正在加载模型: {model_name}")
    
    start = time.time()
    model = SentenceTransformer(model_name)
    elapsed = time.time() - start
    
    logger.info(f"模型加载完成，用时 {elapsed:.2f}秒")
    print(json.dumps({"status": "ready", "model": model_name, "load_time": elapsed}), flush=True)
    
    return model

def init_chroma():
    """初始化 ChromaDB 客户端"""
    import chromadb
    
    if not CHROMA_DIR.exists():
        logger.error(f"ChromaDB 目录不存在: {CHROMA_DIR}")
        return None
    
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    logger.info("ChromaDB 客户端已连接")
    return client

def search_textbooks(client, model, topic: str, subject: str = None, grade: str = None, top_k: int = 3):
    """
    检索教材内容
    
    Args:
        client: ChromaDB 客户端
        model: Embedding 模型
        topic: 查询知识点
        subject: 学科（可选）
        grade: 年级（可选）
        top_k: 返回结果数量
    
    Returns:
        结果列表
    """
    # 生成查询向量
    query_embedding = model.encode([topic])
    
    # 确定要查询的集合
    collections = []
    if subject:
        # 查询指定学科
        collection_name = f"textbooks_{subject}"
        try:
            collection = client.get_collection(collection_name)
            collections.append(collection)
        except Exception:
            logger.warning(f"集合不存在: {collection_name}")
    else:
        # 查询所有学科
        try:
            all_collections = client.list_collections()
            for name in all_collections:
                if name.startswith("textbooks_"):
                    collections.append(client.get_collection(name))
        except Exception as e:
            logger.error(f"获取集合列表失败: {e}")
    
    if not collections:
        return []
    
    # 执行查询
    all_results = []
    
    for collection in collections:
        try:
            where_filter = {}
            if grade:
                where_filter["grade"] = grade
            
            results = collection.query(
                query_embeddings=query_embedding.tolist(),
                n_results=min(top_k, 10),
                where=where_filter if where_filter else None
            )
            
            # 整理结果
            ids = results.get("ids", [[]])[0]
            documents = results.get("documents", [[]])[0]
            metadatas = results.get("metadatas", [[]])[0]
            distances = results.get("distances", [[]])[0]
            
            for i, (doc_id, doc, meta, dist) in enumerate(zip(ids, documents, metadatas, distances)):
                all_results.append({
                    "id": doc_id,
                    "content": doc[:2000] if doc else "",  # 限制长度
                    "metadata": meta,
                    "distance": round(float(dist), 4) if dist is not None else 1.0,
                })
        
        except Exception as e:
            logger.error(f"查询失败: {e}")
    
    # 按距离排序（距离越小越相关）
    all_results.sort(key=lambda x: x["distance"])
    
    # 返回 Top-K
    return all_results[:top_k]

def assemble_context(results: list) -> str:
    """
    将检索结果组装成 Context 字符串
    
    Args:
        results: 检索结果列表
    
    Returns:
        格式化的 context 字符串
    """
    if not results:
        return ""
    
    context_parts = []
    
    for i, result in enumerate(results):
        meta = result.get("metadata", {})
        subject = meta.get("subject", "")
        grade = meta.get("grade", "")
        chapter = meta.get("chapter", "")
        section = meta.get("section", "")
        content = result.get("content", "")
        
        if not content.strip():
            continue
        
        context_parts.append(f"【参考{i+1}】")
        context_parts.append(f"教材：{subject} {grade}")
        if chapter:
            context_parts.append(f"章节：{chapter}")
        if section:
            context_parts.append(f"小节：{section}")
        context_parts.append(f"内容：{content}")
        context_parts.append("")
    
    return "\n".join(context_parts)

def handle_request(request: dict, client, model) -> dict:
    """
    处理单个请求
    
    Args:
        request: 请求字典
        client: ChromaDB 客户端
        model: Embedding 模型
    
    Returns:
        响应字典（包含 requestId）
    """
    action = request.get("action", "")
    request_id = request.get("requestId", "")
    
    response = {"requestId": request_id}
    
    if action == "search":
        topic = request.get("topic", "")
        subject = request.get("subject", "")
        grade = request.get("grade", "")
        top_k = request.get("top_k", 3)
        
        if not topic:
            response.update({"status": "error", "message": "topic is required"})
            return response
        
        start = time.time()
        results = search_textbooks(client, model, topic, subject, grade, top_k)
        elapsed = time.time() - start
        
        context = assemble_context(results)
        
        response.update({
            "status": "success",
            "topic": topic,
            "results_count": len(results),
            "latency_ms": round(elapsed * 1000, 2),
            "results": results,
            "context": context,
        })
    
    elif action == "health":
        """健康检查"""
        response.update({"status": "ok", "service": "search_textbook"})
    
    elif action == "exit":
        """退出服务"""
        response.update({"status": "exiting"})
    
    else:
        response.update({"status": "error", "message": f"Unknown action: {action}"})
    
    return response

def main():
    """主循环"""
    # 确保日志目录存在
    log_dir = BASE_DIR / "data" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # 加载模型
    try:
        model = load_model()
    except Exception as e:
        logger.error(f"模型加载失败: {e}")
        print(json.dumps({"status": "error", "message": str(e)}), flush=True)
        sys.exit(1)
    
    # 初始化 ChromaDB
    try:
        client = init_chroma()
        if not client:
            print(json.dumps({"status": "error", "message": "ChromaDB not found"}), flush=True)
            sys.exit(1)
    except Exception as e:
        logger.error(f"ChromaDB 初始化失败: {e}")
        print(json.dumps({"status": "error", "message": str(e)}), flush=True)
        sys.exit(1)
    
    logger.info("检索服务已启动，等待请求...")
    
    # 主循环：读取 stdin，处理请求，写入 stdout
    try:
        while True:
            line = sys.stdin.readline()
            if not line:
                break
            
            line = line.strip()
            if not line:
                continue
            
            try:
                request = json.loads(line)
            except json.JSONDecodeError as e:
                print(json.dumps({"status": "error", "message": f"Invalid JSON: {str(e)}"}), flush=True)
                continue
            
            # 处理请求
            response = handle_request(request, client, model)
            
            # 输出响应
            print(json.dumps(response, ensure_ascii=False), flush=True)
            
            # 检查退出
            if request.get("action") == "exit":
                logger.info("收到退出指令，服务终止")
                break
    
    except KeyboardInterrupt:
        logger.info("收到中断信号，服务终止")
    
    except Exception as e:
        logger.error(f"服务异常: {e}")
        print(json.dumps({"status": "error", "message": str(e)}), flush=True)
    
    finally:
        logger.info("检索服务已关闭")

if __name__ == "__main__":
    main()
