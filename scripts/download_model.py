#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
下载 Embedding 模型
===============
在 Docker 构建时预下载 BGE 模型，避免运行时下载。
"""

import sys
from sentence_transformers import SentenceTransformer

MODEL_NAME = 'BAAI/bge-large-zh-v1.5'

def download_model():
    print(f"正在下载模型: {MODEL_NAME}")
    try:
        model = SentenceTransformer(MODEL_NAME)
        print(f"模型下载完成: {MODEL_NAME}")
        return True
    except Exception as e:
        print(f"模型下载失败: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    success = download_model()
    sys.exit(0 if success else 1)
