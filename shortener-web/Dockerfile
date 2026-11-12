# Jenkins-агент этого проекта — jenkins/jenkins с java, git и docker CLI; Node, Chromium и
# apt-репозитории там сознательно не появляются. Поэтому юнит-прогон и e2e-прогон едут в
# контейнерах. Контекст — shortener-web, его читает клиент и передаёт демону потоком, так что
# история с DooD-путями из docs/ci-jenkins.md сюда не относится.
# Мажор Node 26 — не вкусовщина: литералы Intl в src/lib/format.test.ts замерены на v26.12.0 /
# ICU 78.3, на другой масти они вправе разойтись (разбор в задаче 7, правило к Task 16 там же).
FROM node:26-bookworm-slim AS deps
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS unit
COPY . ./
RUN npm run lint && npm run typecheck
CMD ["npm", "run", "coverage"]

# Тег = версия @playwright/test из package-lock.json (брать `npm ls @playwright/test`, образ
# приносит ровно те ревизии браузеров, которые ожидает эта версия). В package.json
# @playwright/test фиксируется точной версией, без carets, и меняется синхронно с тегом.
FROM mcr.microsoft.com/playwright:v1.49.1-noble AS e2e
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
CMD ["npx", "playwright", "test", "--workers=1"]
