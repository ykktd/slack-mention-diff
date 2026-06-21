# Slack Mention Diff

対象者リストと完了者リストを照合し、未完了者のSlackメンション下書きを自分のSlack DMへ送るGoogle Apps Script（GAS）製ツールです。

フォーム回答、出欠確認、提出物確認など、サークル内で「まだ完了していない人」を安全にメンションしたいときに使います。

このREADMEは、次の管理者がSlack AppとGASを再設定できることを優先して、必要な手順だけをまとめています。

## できること

- 対象者リストと完了者リストから未完了者を抽出する
- Slackユーザー一覧と照合し、一致した人だけ `<@USERID>` 形式にする
- 同姓同名・複数候補・弱い一致は要確認として表示する
- 作成したメンションだけを、Botから実行者本人のSlack DMへ送る
- Slackログインで対象ワークスペースのメンバーだけに利用を制限する
- Slash CommandからWebアプリのリンクを本人にだけ表示する
- 貼り付けた対象者リスト、完了者リスト、送信したメンション本文は保存しない

リマインド本文は自動生成しません。DMに届いたメンションをコピーし、必要な案内文と一緒にSlackチャンネルへ貼り付けて使います。

## 必要な権限

- GASプロジェクトと管理用スプレッドシートを作成・管理できるGoogleアカウント
- Slack Appを作成し、対象ワークスペースへインストールできる権限

通常の導入にコマンド操作は不要です。`clasp` は開発者向け補足だけで使います。

## 導入手順

1. Slack Appを作成する
2. Slack Appに必要なScopeを追加する
3. 管理用Googleスプレッドシートを作成する
4. GASプロジェクトに `src/` の内容を貼り付ける
5. GASをWebアプリとしてデプロイする
6. Slack AppにRedirect URLとSlash Commandを登録する
7. Slack Appをワークスペースへインストールする
8. GASのScript Propertiesを設定する
9. スプレッドシートの初回セットアップを実行する
10. 管理者が動作確認し、利用者へSlash Commandを案内する

## 1. Slack Appを作成する

1. <https://api.slack.com/apps> を開く
2. 「Create New App」→「From scratch」を選ぶ
3. App Nameを入力する。例: `Slack Mention Diff`
4. 導入先のワークスペースを選ぶ

## 2. Scopeを追加する

Slack App管理画面の「OAuth & Permissions」で、以下を追加します。

| 種類 | Scope | 用途 |
|---|---|---|
| Bot Token Scopes | `users:read` | Slackユーザー一覧の取得 |
| Bot Token Scopes | `chat:write` | 実行者本人のDMへメンション下書きを送信 |
| Bot Token Scopes | `im:write` | 実行者本人とのDMチャンネルを開く |
| Bot Token Scopes | `commands` | Slash CommandでWebアプリURLを返す |

`incoming-webhook` と `users:read.email` は不要です。

この時点では、まだ「Install to Workspace」は押さずに次へ進みます。

## 3. 管理用スプレッドシートを作成する

1. Googleスプレッドシートを新規作成する
2. ファイル名を付ける。例: `Slack Mention Diff 管理用データ`
3. 「拡張機能」→「Apps Script」を開く
4. Apps Scriptのプロジェクト名を付ける。例: `Slack Mention Diff`

このスプレッドシートは、Slackユーザー一覧、利用者のSlackログイン対応、確認済みの名寄せ、実行ログを保存する管理用データ置き場になります。

## 4. GASプロジェクトにコードを貼り付ける

GASエディタで、`src/` 内の各ファイルを作成して貼り付けます。

`.gs` はスクリプトファイル、`.html` はHTMLファイルとして作ります。GAS上のファイル名は拡張子を外した名前です。例: `src/Code.gs` → `Code`、`src/JavaScript.html` → `JavaScript`。

| コピー元 | GAS上のファイル名 |
|---|---|
| `src/Code.gs` | `Code` |
| `src/Config.gs` | `Config` |
| `src/Sheets.gs` | `Sheets` |
| `src/Slack.gs` | `Slack` |
| `src/Matcher.gs` | `Matcher` |
| `src/Index.html` | `Index` |
| `src/Stylesheet.html` | `Stylesheet` |
| `src/JavaScript.html` | `JavaScript` |

続いて、GASエディタ左側の「プロジェクトの設定」で「appsscript.json マニフェスト ファイルをエディタで表示」をオンにし、表示された `appsscript.json` を `src/appsscript.json` の内容で上書きします。

## 5. Webアプリとしてデプロイする

GASエディタ右上の「デプロイ」→「新しいデプロイ」→ 種類の歯車アイコン →「ウェブアプリ」を選びます。

| 項目 | 設定値 |
|---|---|
| 説明 | `v1` など任意 |
| 次のユーザーとして実行 | 自分 |
| アクセスできるユーザー | 全員 |

デプロイ後に表示される **ウェブアプリURL** を控えます。`https://script.google.com/macros/s/.../exec` の形です。

このURLはSlack AppのRedirect URL、Slash CommandのRequest URL、GASのScript Propertiesで使います。末尾の `/exec` まで含めて控えてください。

SlackのSlash CommandからGoogleログインなしでGASへPOSTできる必要があるため、「アクセスできるユーザー」は「全員」にします。`src/appsscript.json` では `ANYONE_ANONYMOUS` として管理しています。

## 6. Redirect URLとSlash Commandを登録する

### Redirect URL

Slack App管理画面の「OAuth & Permissions」→「Redirect URLs」に、手順5のウェブアプリURLを追加して保存します。

このアプリでは、メンバー本人のログインにSign in with Slack（OpenID Connect）を使います。User Token Scopesへ `openid` を追加して再インストールする必要はありません。

### Slash Command

Slack App管理画面の「Slash Commands」→「Create New Command」を開きます。

| 項目 | 設定値 |
|---|---|
| Command | `/mention-diff` |
| Request URL | 手順5のウェブアプリURL |
| Short Description | `未完了メンバー確認ツールを開く` |
| Usage Hint | 空欄でOK |

別のコマンド名にする場合は、Slack側のCommandとScript Propertiesの `SLACK_LINK_COMMAND` を同じ値にしてください。

## 7. Slack Appをインストールする

1. Slack App管理画面の「Install App」を開く
2. 「Install to Workspace」を押す
3. 権限確認画面で許可する
4. 表示された **Bot User OAuth Token** を控える。`xoxb-...` で始まる値です。

ScopeやSlash Commandを変更した場合は、Slack Appの再インストールが必要です。

## 8. Script Propertiesを設定する

GASエディタの「プロジェクトの設定」→「スクリプト プロパティ」に以下を登録します。

| キー | 値 |
|---|---|
| `SLACK_BOT_TOKEN` | 手順7の `xoxb-...` |
| `SLACK_CLIENT_ID` | Slack AppのClient ID |
| `SLACK_CLIENT_SECRET` | Slack AppのClient Secret |
| `SLACK_REDIRECT_URI` | 手順5のウェブアプリURL |
| `SLACK_VERIFICATION_TOKEN` | Slack AppのVerification Token |
| `SLACK_TEAM_ID` | 利用を許可するSlackワークスペースのTeam ID |
| `SLACK_LINK_COMMAND` | 任意。未設定時は `/mention-diff` |
| `ROSTER_URL` | 任意。公開用名簿のURL |

Client ID / Client Secret / Verification Tokenは、Slack App管理画面の「Basic Information」→「App Credentials」で確認できます。

Team IDは `T` で始まる値です。SlackのURL `https://app.slack.com/client/T...` などから確認できます。

`SPREADSHEET_ID` は手順9の初回セットアップで自動保存されるため、手動設定は不要です。

## 9. 初回セットアップを実行する

管理用スプレッドシートを再読み込みすると、上部メニューに「メンション抽出」が表示されます。

1. 「メンション抽出」→「① 初回セットアップ」を押す
2. Googleの承認画面が出たら、GASプロジェクトの管理者アカウントで承認する
3. 「メンション抽出」→「② Slackユーザー一覧を更新」を押す
4. 取得したユーザー数が表示されることを確認する

初回セットアップでは、管理用シートの作成、`SPREADSHEET_ID` の保存、Slackユーザー一覧更新用の日次トリガー作成を行います。

困ったときは、同じメニューの「セットアップ状況を確認」を見てください。

## 10. 動作確認する

1. Slackで `/mention-diff` を実行する
2. 自分だけにWebアプリのリンクが返ることを確認する
3. リンクを開き、「Slackでログイン」する
4. Webアプリで「Slackユーザー一覧を更新」を押し、ユーザー件数が出ることを確認する
5. 対象者リスト・完了者リストを貼り付けて「未完了メンバーを確認」を押す
6. 要確認があればSlackユーザーを選ぶ
7. 「自分のDMへ送る」を押し、Slack DMにメンションだけが届くことを確認する

要確認が残っている場合、DM送信はできません。Slackで見つからない人はメンションに含まれません。

確認できたら、利用者へSlash Commandを案内します。

```text
未完了メンバー確認ツールを導入しました。
Slackで以下のコマンドを入力すると、本人にだけツールのURLが表示されます。

/mention-diff

対象者リストと完了者リストを貼り付けると、未完了メンバーのSlackメンション下書きを作れます。
作成されたメンションは自分のDMに届くので、必要な案内文と一緒にSlackチャンネルへ貼り付けて使ってください。
```

## コードを更新した場合

GASエディタで保存しただけでは、公開中のWebアプリに反映されないことがあります。

1. 「デプロイ」→「デプロイを管理」を開く
2. 現在のデプロイを鉛筆アイコンで編集する
3. 「バージョン」で「新バージョン」を選ぶ
4. 「デプロイ」を押す

既存デプロイを更新すれば、ウェブアプリURLは変わりません。

## 運用メモ

- GASプロジェクトと管理用スプレッドシートの編集権限は、必要な管理者だけに絞ってください。
- Script PropertiesにはSlack AppのClient Secret、Bot Token、Slack連携用の一時情報が保存されます。
- 管理用スプレッドシートにはSlackユーザー一覧、利用者のGoogleユーザーとSlackユーザーの対応、確認済みの名寄せ、実行ログが保存されます。
- 貼り付けた対象者リスト、完了者リスト、送信したメンション本文は保存されません。
- ゲスト、Bot、削除済みユーザー、Slackbotはメンション候補から除外されます。
- Slackユーザー一覧は日次トリガーでも更新されます。急ぎの場合は「メンション抽出」→「② Slackユーザー一覧を更新」を手動実行してください。

## トラブルシュート

| 症状 | 確認すること |
|---|---|
| 「初回セットアップが未完了です」と出る | 管理用スプレッドシートで「メンション抽出」→「① 初回セットアップ」を実行したか |
| メニューが表示されない | スプレッドシートを再読み込みする。出ない場合は、Apps Scriptがそのスプレッドシートに紐づいているか |
| Slackユーザー一覧を更新できない | `SLACK_BOT_TOKEN` と `users:read` scopeが設定されているか |
| OAuthで `bad_redirect_uri` が出る | Slack AppのRedirect URL、GASの `SLACK_REDIRECT_URI`、実際のURLが同じ `.../exec` か |
| Slackログインできない | `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_REDIRECT_URI` / `SLACK_TEAM_ID` が正しいか |
| 対象ワークスペースのメンバーなのにログインできない | `SLACK_TEAM_ID` が対象ワークスペースのTeam IDと一致しているか |
| Slash Commandでリンクが返らない | Request URL、`SLACK_VERIFICATION_TOKEN`、`SLACK_LINK_COMMAND`、`commands` scopeを確認する |
| Slack DMへ送信できない | `chat:write` と `im:write` scopeがあるか。Scope追加後は再インストールが必要 |
| コード変更が反映されない | 「デプロイを管理」から既存デプロイを新バージョンに更新したか |

GASではSlackの署名ヘッダを読めないため、このSlash Commandの検証にはlegacy verification tokenを使います。

## 開発者向け: clasp

通常のワークスペース導入では不要です。

このリポジトリでは `.clasp.json` はGitに含めません。`rootDir` は `src` です。

前提: <https://script.google.com/home/usersettings> で「Google Apps Script API」をオンにします。

```bash
clasp login
clasp create --type sheets --title "Slack Mention Diff" --rootDir src
clasp push
clasp version "v1"
clasp deploy --description "v1"
clasp deployments
```

2回目以降にURLを変えず更新する場合は、表示されたdeployment IDとversion numberを指定します。

```bash
clasp push
clasp version "update"
clasp deploy -i <deploymentId> -V <versionNumber> -d "update"
```

## License

MIT License. See [LICENSE](./LICENSE).
