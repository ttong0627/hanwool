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
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '=+/' | head -c 32)

cat > backend/.env <<EOF
POSTGRES_USER=hanwool
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql+asyncpg://hanwool:${POSTGRES_PASSWORD}@db:5432/hanwool_db
REDIS_URL=redis://redis:6379/0
SECRET_KEY=${SECRET_KEY}
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
AES_KEY=${AES_KEY}
KAKAO_REST_API_KEY=
CORS_ORIGINS=https://ga.wssc.kr
ENVIRONMENT=production
ALLOW_DEMO_SEED=false
EOF

cp backend/.env .env

echo "=== 빌드 & 실행 ==="
docker compose up -d --build

echo "=== 잠시 대기 (DB 초기화) ==="
sleep 15

echo "=== Alembic 마이그레이션 ==="
docker compose exec backend alembic upgrade head

echo "=== 시드 데이터 생성 ==="
echo "Production demo seed is disabled. Set ALLOW_DEMO_SEED=true and run seed.py manually only for demo data."
echo "Create the first admin with: docker compose exec backend python create_admin.py"

echo ""
echo "==========================================="
echo " 서버 준비 완료!"
echo " Web:      https://ga.wssc.kr"
echo "==========================================="
