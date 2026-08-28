import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";

export function buildSlashCommands() {
  return [
    new SlashCommandBuilder()
      .setName("状況")
      .setDescription("大阪店ボーイの現在のオンライン稼働状況を表示"),

    new SlashCommandBuilder()
      .setName("一覧")
      .setDescription("大阪店ボーイ全員のステータス一覧"),

    new SlashCommandBuilder()
      .setName("更新")
      .setDescription("x77.jp から最新の稼働状況を即時取得"),

    new SlashCommandBuilder()
      .setName("履歴")
      .setDescription("最近のステータス変更履歴")
      .addIntegerOption((opt) =>
        opt
          .setName("件数")
          .setDescription("表示件数（デフォルト10、最大50）")
          .setMinValue(1)
          .setMaxValue(50)
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("監視除外")
      .setDescription("指定ボーイを監視対象から除外（管理者）")
      .addStringOption((opt) =>
        opt
          .setName("boy_id")
          .setDescription("除外する boy_id（/一覧 で確認）")
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName("監視再開")
      .setDescription("除外したボーイを監視対象に戻す（管理者）")
      .addStringOption((opt) =>
        opt
          .setName("boy_id")
          .setDescription("再開する boy_id")
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName("設定")
      .setDescription("Bot設定を変更（管理者）")
      .addStringOption((opt) =>
        opt
          .setName("項目")
          .setDescription("変更する設定項目")
          .setRequired(true)
          .addChoices(
            { name: "店舗名", value: "storeName" },
            { name: "店舗ID (shop_id)", value: "shopId" },
            { name: "通知チャンネル", value: "notifyChannel" },
            { name: "通知間隔（分）", value: "notifyInterval" },
            { name: "監視間隔（分）", value: "pollInterval" },
            { name: "定期通知 ON/OFF", value: "notifyEnabled" },
            { name: "メンションロール", value: "mentionRole" },
            { name: "待機中一覧表示", value: "showWaiting" },
            { name: "通話中一覧表示", value: "showInCall" },
            { name: "オフライン一覧表示", value: "showOffline" },
            { name: "ステータス変更通知", value: "pingOnChange" },
            { name: "通知停止開始時刻", value: "quietStart" },
            { name: "通知停止終了時刻", value: "quietEnd" },
            { name: "フッターテキスト", value: "footerText" },
            { name: "並び順", value: "sortBy" }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("値")
          .setDescription("設定値")
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName("設定確認")
      .setDescription("現在のBot設定を表示"),

    new SlashCommandBuilder()
      .setName("通知テスト")
      .setDescription("最新データ取得 + 定期通知プレビュー（管理者）")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName("ヘルプ")
      .setDescription("コマンド一覧と使い方"),
  ].map((cmd) => cmd.toJSON());
}

export function parseSlashInteraction(interaction) {
  const name = interaction.commandName;

  switch (name) {
    case "状況":
      return { command: "status" };
    case "一覧":
      return { command: "members" };
    case "更新":
      return { command: "refresh" };
    case "履歴":
      return {
        command: "history",
        limit: interaction.options.getInteger("件数") || 10,
      };
    case "監視除外":
      return {
        command: "exclude_boy",
        boyId: interaction.options.getString("boy_id"),
      };
    case "監視再開":
      return {
        command: "include_boy",
        boyId: interaction.options.getString("boy_id"),
      };
    case "設定":
      return {
        command: "setting",
        key: interaction.options.getString("項目"),
        value: interaction.options.getString("値"),
      };
    case "設定確認":
      return { command: "settings_show" };
    case "通知テスト":
      return { command: "notify_test" };
    case "ヘルプ":
      return { command: "help" };
    default:
      return { command: "unknown" };
  }
}
