#define DISCORDPP_IMPLEMENTATION
#include "discordpp.h"
#include <nlohmann/json.hpp>
#include <poll.h>
#include <unistd.h>
#include <iostream>
#include <string>
#include <optional>
#include <memory>

// One authenticated SDK instance per process. Tokens arrive only on a private stdin pipe.
using Json = nlohmann::json;
int main() {
  auto client = std::make_shared<discordpp::Client>();
  bool ready = false;
  bool changed = false;
  std::optional<Json> activity;
  std::string token;
  std::string pending;
  client->SetStatusChangedCallback([&](discordpp::Client::Status status, discordpp::Client::Error error, int32_t code) {
    ready = status == discordpp::Client::Status::Ready;
    changed = true;
    Json diag = Json{{"event", "discord.sdk.status"}, {"ready", ready}, {"status", static_cast<int>(status)}, {"error", static_cast<int>(error)}, {"code", code}};
    std::cout << diag.dump() << std::endl;
  });
  // Do not enable SDK file logs or serialize its provider messages.
  for (;;) {
    pollfd fd{STDIN_FILENO, POLLIN, 0};
    int result = poll(&fd, 1, 20);
    if (result < 0) break;
    if (fd.revents & (POLLIN | POLLHUP)) {
      char bytes[4096]; ssize_t count = read(STDIN_FILENO, bytes, sizeof(bytes));
      if (count <= 0) break;
      pending.append(bytes, static_cast<size_t>(count));
      if (pending.size() > 32768) return 2;
      size_t newline;
      while ((newline = pending.find('\n')) != std::string::npos) {
        std::string line = pending.substr(0, newline); pending.erase(0, newline + 1);
        try {
          auto data = Json::parse(line);
          client->SetApplicationId(std::stoull(data.at("applicationId").get<std::string>()));
          auto nextToken = data.at("accessToken").get<std::string>();
          if (nextToken != token) {
            token = nextToken;
            client->UpdateToken(discordpp::AuthorizationTokenType::Bearer, token, [client](discordpp::ClientResult status) {
              if (status.Successful()) client->Connect();
              else std::cout << "{\"event\":\"discord.sdk.authentication_failed\",\"ready\":false}" << std::endl;
            });
          }
          if (data.at("activity").is_null()) activity.reset(); else activity = data.at("activity");
          changed = true;
        } catch (...) {
          std::cout << "{\"event\":\"discord.sdk.invalid_command\",\"ready\":false}" << std::endl;
          return 2;
        }
      }
    }
    discordpp::RunCallbacks();
    if (ready && changed) {
      changed = false;
      if (!activity) client->ClearRichPresence();
      else {
        discordpp::Activity presence;
        presence.SetType(discordpp::ActivityTypes::Listening);
        // Member list shows "♫ <artist>" like Spotify instead of "Listening to Musike".
        presence.SetStatusDisplayType(discordpp::StatusDisplayTypes::State);
        presence.SetDetails(activity->at("title").get<std::string>());
        presence.SetState(activity->at("artist").get<std::string>());
        std::string url = activity->value("url", "");
        if (!url.empty()) presence.SetDetailsUrl(url);
        // Start + end = progress bar with elapsed and total time; start only = count-up timer.
        discordpp::ActivityTimestamps timestamps;
        int64_t start = activity->at("startedAt").get<int64_t>();
        int64_t end = activity->value("endsAt", static_cast<int64_t>(0));
        timestamps.SetStart(start);
        if (end > start) timestamps.SetEnd(end);
        presence.SetTimestamps(timestamps);
        std::string image = activity->value("artwork", "");
        if (!image.empty()) {
          discordpp::ActivityAssets assets;
          assets.SetLargeImage(image);
          std::string album = activity->value("album", "");
          if (!album.empty()) assets.SetLargeText(album);
          if (!url.empty()) assets.SetLargeUrl(url);
          presence.SetAssets(assets);
        }
        client->UpdateRichPresence(presence, [](discordpp::ClientResult status) {
          std::cout << (status.Successful() ? "{\"event\":\"discord.sdk.updated\",\"ok\":true}" : "{\"event\":\"discord.sdk.updated\",\"ok\":false}") << std::endl;
        });
      }
    }
  }
  client->ClearRichPresence();
  client->Disconnect();
  return 0;
}
