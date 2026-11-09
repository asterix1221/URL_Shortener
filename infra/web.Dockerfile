# Интерфейс и конфигурация gateway в одном образе: наружу у стека один вход, и он же отдаёт
# статику. Контекст сборки — корень репозитория (иначе stage сборки не видит shortener-web/),
# поэтому COPY-пути пишутся от корня.
FROM node:26-alpine AS build
WORKDIR /web
COPY shortener-web/package.json shortener-web/package-lock.json ./
RUN npm ci
COPY shortener-web/ ./
# Только сборку, не `npm run build`: тот скрипт = `tsc --noEmit && vite build`, а Task 15
# добавляет `e2e` в tsconfig.include — то есть проверка типов e2e-спеков попала бы в сборку
# образа gateway. Этот образ пересобирает `docker compose up -d --build` в
# `.github/workflows/autotests.yml` (бэкендовый workflow, который этап 9 не правит), и любая
# опечатка в типизации теста выкрасила бы API-автотесты. Типы проверяет `npm run typecheck`
# в web-CI (Step 1), разделённо по слоям.
RUN npx vite build

FROM nginx:1.30.6
COPY infra/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /web/dist /usr/share/nginx/html/app