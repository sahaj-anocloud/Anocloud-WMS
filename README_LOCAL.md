# Running SumoSave WMS Locally

Follow these steps to run the complete system on your local machine.

## Prerequisites
- Docker & Docker Compose
- Node.js 18+
- npm

## 1. Start Infrastructure
Run the following command in the root directory to start PostgreSQL, Redis, and LocalStack:
```bash
docker-compose up -d
```

## 2. Set Up Database
Initialize the database schema:
```bash
cd packages/db-migrations
npm install
npm run migrate
```

## 3. Start Backend (WMS API)
```bash
cd apps/wms-api
cp .env.example .env
npm install
npm run dev
```

## 4. Start Vendor Portal (Next.js)
```bash
cd apps/vendor-portal
npm install
npm run dev
```
Open [http://localhost:3001](http://localhost:3001) (or the port shown in console).

## 5. Start Scanner App (Expo)
```bash
cd apps/scanner-app
npm install
npm run web
```
Open the web preview in your browser.

---

### Note on LocalStack
If the backend fails to connect to SQS, you may need to create the queue in LocalStack manually:
```bash
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name Alert-Events
```
