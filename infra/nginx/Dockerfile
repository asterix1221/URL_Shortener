# Gateway для CI-стека: конфигурация reverse-прокси запечена внутрь образа.
#
# Причина: job в Jenkins поднимает стек через сокет хостового демона (Docker-out-of-Docker), и
# для демона относительный путь ./nginx/nginx.conf — это путь в его собственной файловой
# системе (на хосте), а не в workspace контейнера Jenkins. Монтирование падало на
# «error mounting ".../infra/nginx/nginx.conf" ... not a directory: Are you trying to mount a
# directory onto a file (or vice-versa)?». Контекст сборки так не ломается: его клиент
# docker compose читает сам и передаёт демону потоком, поэтому файл конфигурации доезжает
# до образа независимо от того, откуда запускается сборка.
#
# Версия базового образа совпадает с image: nginx:1.30.6 в infra/docker-compose.yml
# (там — разработческая копия стека, где конфигурация монтируется и обновляется без пересборки).
FROM nginx:1.30.6

COPY nginx.conf /etc/nginx/conf.d/default.conf
