FROM alpine:3.22 AS download
ARG PB_VERSION=0.40.5
RUN apk add --no-cache unzip ca-certificates \
 && wget -q https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip -O /tmp/pb.zip \
 && unzip /tmp/pb.zip pocketbase -d /usr/local/bin

FROM alpine:3.22
RUN apk add --no-cache ca-certificates && adduser -D -H -u 10001 panel
COPY --from=download /usr/local/bin/pocketbase /usr/local/bin/pocketbase
COPY pb_migrations /panel/pb_migrations
COPY pb_hooks /panel/pb_hooks
COPY pb_public /panel/pb_public
RUN mkdir /panel/pb_data && chown panel /panel/pb_data
USER panel
WORKDIR /panel
EXPOSE 8090
CMD ["pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/panel/pb_data", "--migrationsDir=/panel/pb_migrations", "--hooksDir=/panel/pb_hooks", "--publicDir=/panel/pb_public"]
