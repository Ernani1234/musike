FROM debian:bookworm-slim AS sdk-build
RUN apt-get update && apt-get install -y --no-install-recommends g++ nlohmann-json3-dev ca-certificates libasound2 libpulse0 libx11-6 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
# Supply the official Linux C++ SDK from the Developer Portal in the build context.
# Vendor files are deliberately not distributed in this source package.
COPY discord_social_sdk/include/ ./include/
COPY discord_social_sdk/lib/release/libdiscord_partner_sdk.so ./libdiscord_partner_sdk.so
COPY worker.cpp ./worker.cpp
RUN g++ -std=c++20 -O2 -I./include worker.cpp -L. -ldiscord_partner_sdk -Wl,-rpath,'$ORIGIN' -o discord-worker

FROM node:22-bookworm-slim
# Runtime shared libraries required by libdiscord_partner_sdk.so (audio/X11 deps)
RUN apt-get update && apt-get install -y --no-install-recommends libasound2 libpulse0 libx11-6 libatomic1 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=sdk-build /build/discord-worker /build/libdiscord_partner_sdk.so ./
COPY service.mjs ./service.mjs
USER node
ENV LD_LIBRARY_PATH=/app
EXPOSE 8091
CMD ["node", "service.mjs"]
