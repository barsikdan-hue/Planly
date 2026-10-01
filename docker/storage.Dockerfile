# Upstream's security-fixed release is source-only; do not use an older prebuilt image.
FROM golang:1.24.8-bookworm AS build
RUN go install github.com/minio/minio@RELEASE.2025-10-15T17-29-55Z \
 && go install github.com/minio/mc@RELEASE.2025-08-13T08-35-41Z

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir /data && chown 1000:1000 /data
COPY --from=build /go/bin/minio /go/bin/mc /usr/local/bin/
USER 1000:1000
CMD ["minio", "server", "/data", "--console-address", ":9001"]
