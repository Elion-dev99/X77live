import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";

export function buildSlashCommands() {
  return [
    new SlashCommandBuilder()
      .setName("オンライン開始")
      .setDescription("オンライン稼働を開始します")
      .addStringOption((opt) =>
        opt
          .setName("メモ")
          .setDescription("任意のメモ（例: 配信A、夜勤など）")
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("オンライン終了")
      .setDescription("オンライン稼働を終了します"),

    new SlashCommandBuilder()
      .setName("状況")
      .setDescription("現在のオンライン稼働状況を表示します"),

    new SlashCommandBuilder()
      .setName("在籍一覧")
      .setDescription("大阪店在籍メンバー一覧を表示します"),

    new SlashCommandBuilder()
      .setName("履歴")
      .setDescription("最近のオンライン開始/終了履歴を表示します")
      .addIntegerOption((opt) =>
        opt
          .setName("件数")
          .setDescription("表示件数（デフォルト10、最大50）")
          .setMinValue(1)
          .setMaxValue(50)
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("メンバー登録")
      .setDescription("在籍メンバーを登録します（管理者）")
      .addUserOption((opt) =>
        opt.setName("ユーザー").setDescription("登録するユーザー").setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("表示名")
          .setDescription("表示名（省略時はDiscord名）")
          .setRequired(false)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName("メンバー削除")
      .setDescription("在籍メンバーを削除します（管理者）")
      .addUserOption((opt) =>
        opt.setName("ユーザー").setDescription("削除するユーザー").setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName("ロール同期")
      .setDescription("在籍ロールのメンバーを自動登録します（管理者）")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName("設定")
      .setDescription("Bot設定を変更します（管理者）")
      .addStringOption((opt) =>
        opt
          .setName("項目")
          .setDescription("変更する設定項目")
          .setRequired(true)
          .addChoices(
            { name: "店舗名", value: "storeName" },
            { name: "通知チャンネル", value: "notifyChannel" },
            { name: "通知間隔（分）", value: "notifyInterval" },
            { name: "定期通知 ON/OFF", value: "notifyEnabled" },
            { name: "在籍ロール", value: "memberRole" },
            { name: "メンションロール", value: "mentionRole" },
            { name: "オフライン者メンション", value: "mentionOffline" },
            { name: "稼働時間表示", value: "showDuration" },
            { name: "オンライン一覧表示", value: "showOnlineList" },
            { name: "未稼働一覧表示", value: "showOfflineList" },
            { name: "メモ表示", value: "includeNote" },
            { name: "ステータス変更通知", value: "pingOnChange" },
            { name: "通知停止開始時刻", value: "quietStart" },
            { name: "通知停止終了時刻", value: "quietEnd" },
            { name: "フッターテキスト", value: "footerText" },
            { name: "オンライン並び順", value: "sortOnline" },
            { name: "未稼働並び順", value: "sortOffline" }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("値")
          .setDescription("設定値（true/false、数値、テキスト、HH:MM 等）")
          .setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName("設定確認")
      .setDescription("現在のBot設定を表示します"),

    new SlashCommandBuilder()
      .setName("通知テスト")
      .setDescription("定期通知のプレビューを送信します（管理者）")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName("強制終了")
      .setDescription("指定メンバーのオンラインを強制終了します（管理者）")
      .addUserOption((opt) =>
        opt.setName("ユーザー").setDescription("対象ユーザー").setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    new SlashCommandBuilder()
      .setName("ヘルプ")
      .setDescription("コマンド一覧と使い方を表示します"),
  ].map((cmd) => cmd.toJSON());
}

export function parseSlashInteraction(interaction) {
  const name = interaction.commandName;

  switch (name) {
    case "オンライン開始":
      return { command: "start", note: interaction.options.getString("メモ") || "" };
    case "オンライン終了":
      return { command: "stop" };
    case "状況":
      return { command: "status" };
    case "在籍一覧":
      return { command: "members" };
    case "履歴":
      return {
        command: "history",
        limit: interaction.options.getInteger("件数") || 10,
      };
    case "メンバー登録":
      return {
        command: "add_member",
        user: interaction.options.getUser("ユーザー"),
        displayName: interaction.options.getString("表示名"),
      };
    case "メンバー削除":
      return {
        command: "remove_member",
        user: interaction.options.getUser("ユーザー"),
      };
    case "ロール同期":
      return { command: "sync_roles" };
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
    case "強制終了":
      return {
        command: "force_stop",
        user: interaction.options.getUser("ユーザー"),
      };
    case "ヘルプ":
      return { command: "help" };
    default:
      return { command: "unknown" };
  }
}
