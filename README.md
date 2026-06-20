# Slack Mention Diff

対象者リストと完了者リストを照合し、未完了者の Slack メンション下書きを自分のSlack DMへ送る Google Apps Script 製Webアプリです。

フォーム回答、出欠確認、提出物確認など、サークル内で「まだ完了していない人」を安全にメンションしたいときに使います。

## できること

- 対象者リストと完了者リストから未完了者を抽出する
- Slackユーザー一覧と照合し、一致した人だけ `<@USERID>` 形式にする
- 同姓同名・複数候補・弱い一致は要確認として表示する
- 作成したメンションだけを、Botから実行者本人のSlack DMへ送る
- Slackログインで対象ワークスペースのメンバーだけに利用を制限する
- Slash CommandからWebアプリのリンクを自分だけに表示する

リマインド本文は自動生成しません。DMに届いたメンションをコピーし、必要な案内文と一緒にSlackチャンネルへ貼り付けて使います。

## 初回設定の流れ

基本はブラウザだけで設定できます。所要時間の目安は30〜60分です。

1. Slack Appを作成する
2. 管理用Googleスプレッドシートを作成する
3. スプレッドシートからApps Scriptエディタを開く
4. このリポジトリの `src/` 内のファイルをApps Scriptへ貼り付ける
5. Webアプリとしてデプロイし、WebアプリURLを控える
6. Script Propertiesを設定する
7. Slack AppにWebアプリURLを登録する
8. スプレッドシートの「メンション抽出」メニューから初回セットアップを実行する
9. Slash CommandとWebアプリの動作を確認する

## 1. Slack Appを作成する

<https://api.slack.com/apps> から新しいSlack Appを作成します。

「OAuth & Permissions」でBot Token Scopesに以下を追加してください。

| Scope | 用途 |
|---|---|
| `users:read` | Slackユーザー一覧の取得 |
| `chat:write` | 自分のDMへの投稿 |
| `im:write` | 自分とのDMチャンネル作成 |
| `commands` | Slash Commandの利用 |

追加後、「Install to Workspace」でワークスペースへインストールします。あとで使うので、以下を控えてください。

- Bot User OAuth Token（`xoxb-...`）
- Client ID
- Client Secret
- Verification Token
- Team ID（`T` で始まる値。SlackのURL `https://app.slack.com/client/T...` から確認できます）

`incoming-webhook` と `users:read.email` は不要です。

## 2. Apps Scriptにコードを貼り付ける

管理用Googleスプレッドシートを作成し、「拡張機能」→「Apps Script」を開きます。プロジェクト名は `Slack Mention Diff` などに変更してください。

Apps Scriptエディタで、下の表どおりにファイルを作成し、同名のGitHubファイルの内容を全文コピーして貼り付けます。エディタ側のファイル名には `.gs` や `.html` を付けません。

| コピー元 | Apps Scriptでの作成方法 | ファイル名 |
|---|---|---|
| [src/Code.gs](src/Code.gs) | 最初からある `コード.gs` を置き換え | `Code` |
| [src/Config.gs](src/Config.gs) | 「+」→「スクリプト」 | `Config` |
| [src/Sheets.gs](src/Sheets.gs) | 「+」→「スクリプト」 | `Sheets` |
| [src/Slack.gs](src/Slack.gs) | 「+」→「スクリプト」 | `Slack` |
| [src/Matcher.gs](src/Matcher.gs) | 「+」→「スクリプト」 | `Matcher` |
| [src/Index.html](src/Index.html) | 「+」→「HTML」 | `Index` |
| [src/Stylesheet.html](src/Stylesheet.html) | 「+」→「HTML」 | `Stylesheet` |
| [src/JavaScript.html](src/JavaScript.html) | 「+」→「HTML」 | `JavaScript` |

新規ファイルにサンプルコードが入っている場合は、全部消してから貼り付けます。貼り付けたら保存してください。

### appsscript.json

`appsscript.json` は初期状態では隠れています。

1. Apps Script左側の歯車アイコン「プロジェクトの設定」を開く
2. 「`appsscript.json` マニフェスト ファイルをエディタで表示する」をオンにする
3. エディタに戻り、`appsscript.json` を開く
4. 中身を全部消し、[src/appsscript.json](src/appsscript.json) を貼り付けて保存する

## 3. Webアプリとしてデプロイする

Apps Scriptエディタ右上の「デプロイ」→「新しいデプロイ」から設定します。

| 項目 | 設定値 |
|---|---|
| 種類 | ウェブアプリ |
| 説明 | `Slack Mention Diff` など |
| 次のユーザーとして実行 | 自分 |
| アクセスできるユーザー | 全員 |

デプロイ後に表示される **ウェブアプリのURL** を控えてください。このURLを次の3か所に同じ値で設定します。

- Slack App: OAuth & Permissions → Redirect URLs
- Slack App: Slash Commands → Request URL
- Apps Script: Script Properties → `SLACK_REDIRECT_URI`

コード更新時は「新しいデプロイ」を作らず、「デプロイ」→「デプロイを管理」→既存デプロイを編集→「バージョン: 新バージョン」で更新します。これならWebアプリURLは変わりません。

## 4. Script Propertiesを設定する

Apps Script左側の歯車アイコン「プロジェクトの設定」→「スクリプト プロパティ」で以下を登録します。

| キー | 値 |
|---|---|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token（`xoxb-...`） |
| `SLACK_CLIENT_ID` | Slack AppのClient ID |
| `SLACK_CLIENT_SECRET` | Slack AppのClient Secret |
| `SLACK_REDIRECT_URI` | WebアプリURL |
| `SLACK_VERIFICATION_TOKEN` | Slack AppのVerification Token |
| `SLACK_TEAM_ID` | 利用を許可するSlackワークスペースのTeam ID |
| `SLACK_LINK_COMMAND` | 任意。未設定なら `/mention-diff` |
| `ROSTER_URL` | 任意。公開用名簿のURL。設定すると対象者リスト欄に「名簿を開く」リンクが表示される |

`SPREADSHEET_ID` は初回セットアップ時に自動保存されるため、手動設定は不要です。

`SLACK_TEAM_ID` は対象外ワークスペースのログインを防ぐために必須です。

## 5. Slack側にWebアプリURLを登録する

Slack Appで以下を設定します。

### OAuth Redirect URL

「OAuth & Permissions」→「Redirect URLs」にWebアプリURLを追加します。

このアプリでは、メンバー本人のログインにSign in with Slack（OpenID Connect）を使います。User Token Scopesへ `openid` を追加して再インストールする必要はありません。

### Slash Command

「Slash Commands」→「Create New Command」で作成します。

| 項目 | 設定値 |
|---|---|
| Command | `/mention-diff` |
| Request URL | WebアプリURL |
| Short Description | `未完了メンバー確認ツールを開く` |
| Usage Hint | 空欄でOK |

別のコマンド名にする場合は、Slack側のCommandとScript Propertiesの `SLACK_LINK_COMMAND` を同じ値にしてください。

## 6. 初回セットアップを実行する

管理用スプレッドシートを再読み込みすると、上部メニューに「メンション抽出」が表示されます。

1. 「メンション抽出」→「① 初回セットアップ」を押す
2. 権限承認が出たら許可する
3. 「メンション抽出」→「② Slackユーザー一覧を更新」を押す

初回セットアップでは、管理用シートの作成、`SPREADSHEET_ID` の保存、Slackユーザー一覧更新用の日次トリガー作成を行います。

困ったときは、同じメニューの「セットアップ状況を確認」を見てください。

## 7. 動作確認

1. Slackで `/mention-diff` を実行する
2. 自分だけにWebアプリのリンクが返ることを確認する
3. リンクを開き、「Slackでログイン」する
4. Webアプリで「Slackユーザー一覧を更新」を押し、ユーザー件数が出ることを確認する
5. 対象者リスト・完了者リストを貼り付けて「未完了メンバーを確認」を押す
6. 要確認があればSlackユーザーを選ぶ
7. 「自分のDMへ送る」を押し、Slack DMにメンションだけが届くことを確認する

要確認が残っている場合、DM送信はできません。Slackで見つからない人はメンションに含まれません。

## 利用者向けの使い方

1. `/mention-diff` でWebアプリを開く
2. 初回だけSlackでログインする
3. 対象者リストに確認したい人を1行に1人ずつ貼る
4. 完了者リストに完了済みの人を1行に1人ずつ貼る
5. 未完了メンバーを確認する
6. 要確認を選ぶ
7. 自分のDMへ送る
8. DMに届いたメンションをコピーして、案内文と一緒に投稿する

## トラブルシュート

| 症状 | 確認すること |
|---|---|
| 「初回セットアップが未完了です」と出る | 管理用スプレッドシートで「メンション抽出」→「① 初回セットアップ」を実行する |
| メニューが表示されない | スプレッドシートを再読み込みする。出ない場合は、Apps Scriptがそのスプレッドシートに紐づいているか確認する |
| Slackユーザー一覧を更新できない | `SLACK_BOT_TOKEN` と `users:read` scopeを確認する |
| Slackログインできない | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI`, `SLACK_TEAM_ID` とRedirect URLの一致を確認する |
| Slash Commandでリンクが返らない | Request URL、`SLACK_VERIFICATION_TOKEN`、`SLACK_LINK_COMMAND` を確認する |
| コード変更が反映されない | 新しいデプロイではなく、既存デプロイを新バージョンに更新する |

## 開発者向け: claspで更新する場合

通常の引き継ぎでは不要です。コマンドラインで更新したい場合だけ使ってください。

このリポジトリでは `.clasp.json` はGitに含めません。`rootDir` は `src` です。

```sh
clasp push
clasp version "Update Slack Mention Diff"
clasp deployments
clasp deploy -i <deploymentId> -V <versionNumber> -d "Update Slack Mention Diff"
```

既存のWebアプリURLを維持するには、既存Webアプリの `deploymentId` を指定してデプロイします。

## License

MIT License. See [LICENSE](./LICENSE).