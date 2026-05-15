#!/bin/bash
# GCE VM 초기 셋업 스크립트 (Ubuntu 22.04)
# 실행: bash setup-server.sh

set -e

echo "=== Docker 설치 ==="
apt-get update
apt-get install -y ca-certificates curl gnupg git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
usermod -aG docker $USER

echo "=== 프로젝트 클론 ==="
cd /opt
git clone https://github.com/ttong0627/hanwool.git
cd hanwool

echo "=== .env 생성 ==="
# SECRET_KEY, AES_KEY는 아래에서 랜덤 생성
SECRET_KEY=$(openssl rand -hex 32)
AES_KEY=$(openssl rand -hex 16 | head -c 32)

cat > backend/.env <<EOF
DATABASE_URL=postgresql+asyncpg://hanwool:hanwool1234@db:5432/hanwool_db
REDIS_URL=redis://redis:6379/0
SECRET_KEY=${SECRET_KEY}
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
AES_KEY=${AES_KEY}
KAKAO_REST_API_KEY=
CORS_ORIGINS=http://$(curl -s ifconfig.me):80,http://$(curl -s ifconfig.me):8000
ENVIRONMENT=production
EOF

echo "=== 빌드 & 실행 ==="
docker compose up -d --build

echo "=== 잠시 대기 (DB 초기화) ==="
sleep 15

echo "=== Alembic 마이그레이션 ==="
docker compose exec backend alembic upgrade head

echo "=== 시드 데이터 생성 ==="
docker compose exec backend python seed.py

echo ""
echo "==========================================="
echo " 서버 준비 완료!"
echo " API:      http://$(curl -s ifconfig.me):8000"
echo " API Docs: http://$(curl -s ifconfig.me):8000/docs"
echo " Web:      http://$(curl -s ifconfig.me):80"
echo "==========================================="
