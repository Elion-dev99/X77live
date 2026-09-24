    case "notify_test": {
      await interaction.deferReply({ ephemeral: true });
      await runScrape(getConfig, persistConfig, clientRef, { force: true });

      if (clientRef) {
        await sendPeriodicNotification(
          getConfig,
          persistConfig,
          buildNotificationEmbed,
          { force: true }
        );
      }

      let dmSent = false;
      if (clientRef) {
        const adminMessage = [
          "✅ **管理者DMテスト送信**",
          "",
          `時刻: ${new Date().toISOString()}`,
          "このメッセージが届いていれば、管理者DM通知は正常に動作しています。",
        ].join("\n");
        dmSent = await sendAdminDirectMessage(clientRef, getConfig(), adminMessage);
      }

      return {
        type: "deferred",
        interaction,
        content: dmSent
          ? "✅ 最新データを取得し、通知テストと管理者DMテストを送信しました。"
          : "✅ 最新データを取得し、通知テストを送信しました。管理者DMの設定が未設定のためDMは送れていません。",
        ephemeral: true,
      };
    }
