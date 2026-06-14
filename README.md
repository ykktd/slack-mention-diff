# Slack Mention Diff

対象者リストと完了者リストを照合し、未完了者の Slack メンション下書きを自分のSlack DMへ送る Google Apps Script 製 Web アプリです。

フォーム回答、出欠確認、提出物確認、確認依頼など、サークル内の「まだ完了していない人」を安全にメンションしたい場面で使います。

## このツールでできること

- 対象者リストと完了者リストを貼り付けて、未完了者を抽出します。
- Slack のユーザー一覧キャッシュと照合し、確実に一致した人だけを自動でメンション化します。
- 同姓同名、複数候補、弱い一致は「要確認」として表示し、選ばれるまでDM下書きに含めません。
- Botが実行ユーザー本人のSlack DMへ `<@USERID>` の羅列だけを送ります。リマインド文は自動生成しません。
- Slackユーザー一覧は日次トリガーで更新でき、画面から手動更新もできます。

## 導入の全体像

1. Slack Appを作成し、`users:read`, `chat:write`, `im:write` scopeを設定する
2. 管理用に使うスプレッドシートを作成し、そのスプレッドシートにApps Scriptを紐づける
3. `src/` 内のファイルをGASエディタへ配置する
4. Webアプリとして一度デプロイし、WebアプリURLを控える
5. Slack AppのOAuth Redirect URLにWebアプリURLを登録する
6. Slack Appをワークスペースへインストールし、Bot TokenとClient ID/Secretを控える
7. GASのScript Propertiesに `SLACK_BOT_TOKEN`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI` を設定する
8. スプレッドシートのメニューから初回セットアップを実行する
9. 必要なら既存デプロイを新しいバージョンへ更新し、URLをサークル内に共有する

## Slack Appを作成する

1. <https://api.slack.com/apps> を開きます。
2. 「Create New App」から新しいアプリを作成します。
3. 「OAuth & Permissions」を開き、Bot Token Scopesに以下を追加します。

| 種類 | Scope | 用途 |
|---|---|---|
| Bot Token Scopes | `users:read` | Slackユーザー一覧を取得するため |
| Bot Token Scopes | `chat:write` | 自分のDMへメンション下書きを投稿するため |
| Bot Token Scopes | `im:write` | 自分とのDMチャンネルを開くため |

`incoming-webhook`、`users:read.email` は不要です。

OAuth & Permissions の Redirect URLs には、デプロイ後のWebアプリURLを登録してください。コード更新でデプロイURLが変わった場合は、Slack側のRedirect URLも更新します。

## GASプロジェクトを作成する

1. 管理用に使うGoogleスプレッドシートを作成します。
2. スプレッドシート上部の「拡張機能」→「Apps Script」を開きます。
3. プロジェクト名を変更します。例: `Slack Mention Diff`
4. `src/` 内のファイルをGASエディタへ作成して貼り付けます。

| リポジトリ上のファイル | GASエディタで作るファイル |
|---|---|
| `src/Code.gs` | スクリプトファイル `Code` |
| `src/Config.gs` | スクリプトファイル `Config` |
| `src/Sheets.gs` | スクリプトファイル `Sheets` |
| `src/Slack.gs` | スクリプトファイル `Slack` |
| `src/Matcher.gs` | スクリプトファイル `Matcher` |
| `src/Index.html` | HTMLファイル `Index` |
| `src/Stylesheet.html` | HTMLファイル `Stylesheet` |
| `src/JavaScript.html` | HTMLファイル `JavaScript` |

### appsscript.jsonを設定する

1. GASエディタ左側の「プロジェクトの設定」を開きます。
2. 「appsscript.json マニフェスト ファイルをエディタで表示」をオンにします。
3. 表示された `appsscript.json` を開き、`src/appsscript.json` の内容で上書きします。

## Script Propertiesを設定する

GASエディタで「プロジェクトの設定」からスクリプト プロパティを開き、以下を登録します。

| キー | 値 | 必須 |
|---|---|---|
| `SLACK_BOT_TOKEN` | Slack AppのBot User OAuth Token。`xoxb-...` で始まる値 | 必須 |
| `SLACK_CLIENT_ID` | Slack AppのBasic Informationに表示されるClient ID | 必須 |
| `SLACK_CLIENT_SECRET` | Slack AppのBasic Informationに表示されるClient Secret | 必須 |
| `SLACK_REDIRECT_URI` | デプロイ後のWebアプリURL。Slack側のRedirect URLと同じ値 | 必須 |
| `SPREADSHEET_ID` | 初回セットアップで自動保存されます | 手動設定不要 |

`SPREADSHEET_ID` は通常は手動設定不要です。次の初回セットアップが、バインド先スプレッドシートのIDを自動で保存します。

## 初回セットアップを実行する

スプレッドシートを再読み込みすると、上部メニューに「メンション抽出」が表示されます。

1. スプレッドシート上部メニュー「メンション抽出」を開きます。
2. 「① 初回セットアップ」を押します。
3. 権限承認が表示されたら許可します。
4. 続けて「② Slackユーザー一覧を更新」を押します。

`setup()` は以下を行います。

- バインド先スプレッドシートを管理用データ置き場として設定する
- `Settings`, `SlackUsers`, `NameMap`, `LastRun`, `Logs` シートを作成する
- `UserMap` シートを作成し、GoogleユーザーとSlackユーザーIDの対応を保存できるようにする
- バインド先スプレッドシートIDを Script Properties の `SPREADSHEET_ID` に保存する
- Slackユーザー一覧更新用の日次トリガーを作成する

メニューには「セットアップ状況を確認」「Slack Token設定手順を見る」「Webアプリのデプロイ手順を見る」もあります。作業中に迷ったら、このメニューから現在の状態や次の作業を確認できます。

`SLACK_BOT_TOKEN` が未設定でも初回セットアップは実行できます。Slackユーザー一覧の更新は、Token設定後にスプレッドシートメニューまたはWebアプリ画面の「Slackユーザー一覧を更新」から実行してください。

## Webアプリとしてデプロイする

1. GASエディタ右上の「デプロイ」から「新しいデプロイ」を選びます。
2. 種類は「ウェブアプリ」を選びます。
3. 次のように設定します。

| 項目 | 設定値 |
|---|---|
| 次のユーザーとして実行 | 自分 |
| アクセスできるユーザー | 全員 |

4. デプロイ後に表示されるWebアプリURLを控えます。
5. そのURLをSlack AppのRedirect URLsと `SLACK_REDIRECT_URI` に設定します。
6. URLを開き、「Slackユーザー一覧を更新」を押して、ユーザー件数が表示されることを確認します。

WebアプリURLを知っている人が画面を開けます。SNSなどの公開場所には貼らず、必要なサークルメンバー内で共有してください。

## 使い方

1. 対象者リストに、照合したい人を1行に1人ずつ貼り付けます。
2. 完了者リストに、すでに完了している人を1行に1人ずつ貼り付けます。
3. 「照合する」を押します。
4. 要確認が出た場合は、正しいSlackユーザーを選びます。
5. Slack未連携の場合は「Slackと連携する」を押します。
6. 「自分のDMへ送信」を押します。
7. Slack上でBotから届いたメンションの羅列をコピーし、任意のチャンネルの投稿文に貼り付けます。

未照合者や、未選択の要確認者はDM下書きに含まれません。要確認者が残っている場合、DM送信はできません。

## 開発者向け: claspを使う場合

このリポジトリでは `.clasp.json` はローカル設定として扱い、Gitには含めません。`rootDir` は `src` です。

ローカルからGASへ反映する場合は、必要に応じて以下を実行します。

```sh
clasp push
```

既存のWebアプリURLを変えずに更新したい場合は、`clasp push` 後にGASエディタの「デプロイを管理」から既存デプロイを新しいバージョンへ更新してください。

## トラブルシュート

| 症状 | 確認すること |
|---|---|
| 画面に「初回セットアップが未完了です」と出る | スプレッドシートメニュー「メンション抽出」→「① 初回セットアップ」を実行してください。 |
| メニューが表示されない | スプレッドシートを再読み込みしてください。それでも出ない場合は、GASがそのスプレッドシートにバインドされているか確認してください。 |
| Slackユーザー一覧を更新できない | `SLACK_BOT_TOKEN` が設定されているか、Slack Appに `users:read` があるか確認してください。 |
| Slack連携を開始できない | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI` が設定されているか確認してください。 |
| DM送信に失敗する | Slack Appに `chat:write` と `im:write` があるか、Bot Tokenが再インストール後のものか確認してください。 |
| ユーザーが未照合になる | Slackの表示名または本名に日本語氏名が入っているか確認してください。 |
| 同姓同名が自動でメンションされない | 誤メンションを避けるため、要確認として扱います。候補を選んでからDMへ送信してください。 |
| コード変更がWebアプリに反映されない | 既存デプロイを新しいバージョンへ更新してください。 |
