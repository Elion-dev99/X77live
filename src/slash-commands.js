import { SlashCommandBuilder } from "discord.js";

function passwordOption(required = false) {
  return (opt) =>
    opt
      .setName("パスワード")
      .setDescription("管理パスワード（未ログイン時は必須）")
      .setRequired(required);
}

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
      .setDescription("x77.jp から最新の稼働状況を即時取得")
      .addStringOption(passwordOption(false)),

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
      )
      .addStringOption(passwordOption(false)),

    new SlashCommandBuilder()
      .setName("認証")
      .setDescription("管理パスワードでログイン（管理者コマンド用）")
      .addStringOption((opt) =>
        opt
          .setName("パスワード")
          .setDescription("管理パスワード")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("ログアウト")
      .setDescription("管理セッションを終了"),

    new SlashCommandBuilder()
      .setName("監視除外")
      .setDescription("指定ボーイを監視対象から除外")
      .addStringOption((opt) =>
        opt
          .setName("boy_id")
          .setDescription("除外する boy_id（/一覧 で確認）")
          .setRequired(true)
      )
      .addStringOption(passwordOption(false)),

    new SlashCommandBuilder()
      .setName("監視再開")
      .setDescription("除外したボーイを監視対象に戻す")
      .addStringOption((opt) =>
        opt
          .setName("boy_id")
          .setDescription("再開する boy_id")
          .setRequired(true)
      )
      .addStringOption(passwordOption(false)),

    new SlashCommandBuilder()
      .setName("設定")
      .setDescription("Bot設定を変更")
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
            { name: "並び順", value: "sortBy" },
            { name: "認証セッション時間（時間）", value: "sessionHours" }
          )
      )
      .addStringOption((opt) =>
        opt.setName("値").setDescription("設定値").setRequired(true)
      )
      .addStringOption(passwordOption(false)),

    new SlashCommandBuilder()
      .setName("設定確認")
      .setDescription("現在のBot設定を表示")
      .addStringOption(passwordOption(false)),

    new SlashCommandBuilder()
      .setName("通知テスト")
      .setDescription("最新データ取得 + 定期通知プレビュー")
      .addStringOption(passwordOption(false)),

    new SlashCommandBuilder()
      .setName("パスワード変更")
      .setDescription("管理パスワードを変更")
      .addStringOption((opt) =>
        opt
          .setName("現在のパスワード")
          .setDescription("現在の管理パスワード")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("新しいパスワード")
          .setDescription("新しい管理パスワード（4文字以上）")
          .setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("再起動")
      .setDescription("Bot サーバーを再起動（Bot-Hosting が自動で起動し直します）")
      .addStringOption(passwordOption(false)),

    new SlashCommandBuilder()
      .setName("レポート一覧")
      .setDescription("保存済みの営業日レポート一覧を表示")
      .addIntegerOption((opt) =>
        opt
          .setName("件数")
          .setDescription("表示件数（デフォルト10、最大30）")
          .setMinValue(1)
          .setMaxValue(30)
          .setRequired(false)
      )
      .addStringOption(passwordOption(false)),

    new SlashCommandBuilder()
      .setName("レポート取得")
      .setDescription("営業日レポートファイル（JSON/CSV）をダウンロード")
      .addStringOption((opt) =>
        opt
          .setName("営業日")
          .setDescription("営業開始日 YYYY-MM-DD（省略時は最新）")
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName("形式")
          .setDescription("ファイル形式（デフォルト: 両方）")
          .setRequired(false)
          .addChoices(
            { name: "JSON", value: "json" },
            { name: "CSV", value: "csv" },
            { name: "両方", value: "both" }
          )
      )
      .addStringOption(passwordOption(false)),

    new SlashCommandBuilder()
      .setName("レポート途中")
      .setDescription("営業日の現時点までの暫定レポートを表示")
      .addStringOption((opt) =>
        opt
          .setName("形式")
          .setDescription("ファイル添付（省略時は Embed のみ）")
          .setRequired(false)
          .addChoices(
            { name: "表示のみ", value: "view" },
            { name: "JSON", value: "json" },
            { name: "CSV", value: "csv" },
            { name: "両方", value: "both" }
          )
      )
      .addStringOption(passwordOption(false)),

    new SlashCommandBuilder()
      .setName("設定復元")
      .setDescription("config.json の最新バックアップから設定を復元")
      .addStringOption((opt) =>
        opt
          .setName("バックアップ")
          .setDescription("ファイル名（省略時は config-latest.json）")
          .setRequired(false)
      )
      .addStringOption(passwordOption(false)),

    new SlashCommandBuilder()
      .setName("ヘルプ")
      .setDescription("コマンド一覧と使い方"),
  ].map((cmd) => cmd.toJSON());
}

function getPassword(interaction) {
  return interaction.options.getString("パスワード") || null;
}

export function parseSlashInteraction(interaction) {
  const name = interaction.commandName;

  switch (name) {
    case "状況":
      return { command: "status" };
    case "一覧":
      return { command: "members" };
    case "更新":
      return {
        command: "refresh",
        password: getPassword(interaction),
      };
    case "履歴":
      return {
        command: "history",
        limit: interaction.options.getInteger("件数") || 10,
        password: getPassword(interaction),
      };
    case "認証":
      return {
        command: "login",
        password: interaction.options.getString("パスワード"),
      };
    case "ログアウト":
      return { command: "logout" };
    case "監視除外":
      return {
        command: "exclude_boy",
        boyId: interaction.options.getString("boy_id"),
        password: getPassword(interaction),
      };
    case "監視再開":
      return {
        command: "include_boy",
        boyId: interaction.options.getString("boy_id"),
        password: getPassword(interaction),
      };
    case "設定":
      return {
        command: "setting",
        key: interaction.options.getString("項目"),
        value: interaction.options.getString("値"),
        password: getPassword(interaction),
      };
    case "設定確認":
      return {
        command: "settings_show",
        password: getPassword(interaction),
      };
    case "通知テスト":
      return {
        command: "notify_test",
        password: getPassword(interaction),
      };
    case "パスワード変更":
      return {
        command: "change_password",
        currentPassword: interaction.options.getString("現在のパスワード"),
        newPassword: interaction.options.getString("新しいパスワード"),
      };
    case "再起動":
      return {
        command: "restart_server",
        password: getPassword(interaction),
      };
    case "レポート一覧":
      return {
        command: "report_list",
        limit: interaction.options.getInteger("件数") || 10,
        password: getPassword(interaction),
      };
    case "レポート取得":
      return {
        command: "report_download",
        sessionKey: interaction.options.getString("営業日"),
        format: interaction.options.getString("形式") || "both",
        password: getPassword(interaction),
      };
    case "レポート途中":
      return {
        command: "report_interim",
        format: interaction.options.getString("形式") || "view",
        password: getPassword(interaction),
      };
    case "設定復元":
      return {
        command: "restore_config",
        backupName: interaction.options.getString("バックアップ"),
        password: getPassword(interaction),
      };
    case "ヘルプ":
      return { command: "help" };
    default:
      return { command: "unknown" };
  }
}
