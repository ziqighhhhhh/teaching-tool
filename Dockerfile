FROM node:18-slim AS base

# 安装 Python 3.9 和依赖
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制项目文件
COPY . .

# 安装 Node.js 依赖
RUN npm install

# 安装 Python 依赖
RUN pip3 install --no-cache-dir -r requirements.txt

# 下载 Embedding 模型（首次构建时缓存）
RUN python3 scripts/download_model.py

# 暴露端口
EXPOSE 8082

# 启动命令
CMD ["node", "server.js"]
