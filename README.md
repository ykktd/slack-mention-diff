# Slack Mention Diff

対象者リストと完了者リストを照合し、未完了者の Slack メンション下書きを自分のSlack DMへ送る Google Apps Script 製 Web アプリです。

フォーム回答、出欠確認、提出物確認、確認依頼など、サークル内の「まだ完了していない人」を安全にメンションしたい場面で使います。

## このツールでできること

- 対象のSlackワークスペースのメンバーが、自分本人としてSlackでログインしてから使います。対象外のアカウントはログインできず、名簿も表示されません。
- 対象者リストと完了者リストを貼り付けて、未完了者を抽出します。
- Slack のユーザー一覧キャッシュと照合し、確実に一致した人だけを自動でメンション化します。
- 同姓同名、複数候補、弱い一致は「要確認」として表示し、選ばれるまでDM下書きに含めません。
- Botが実行ユーザー本人のSlack DMへ `<@USERID>` の羅列だけを送ります。リマインド文は自動生成しません。
- Slackユーザー一覧は日次トリガーで更新でき、画面から手動更新もできます。
- SlackのSlash Commandから、Webアプリを開くリンクを自分だけに見えるメッセージで受け取れます。

## 導入の全体像

このREADMEでは、専門ツール（clasp）を使わず、**ブラウザ上のApps Scriptエディタにコードを貼り付ける方法**を基本にして説明します。プログラミングの知識がなくても、手順どおりに進めれば導入できます。所要時間の目安は30〜60分です。

引き継ぎのときは、この「導入の全体像」の順番どおりに、各セクションを上から進めてください。

1. **Slack App** を作成し、Bot Token Scopes `users:read`, `chat:write`, `im:write`, `commands` を設定する
2. 管理用の **Googleスプレッドシート** を作成し、そこからApps Scriptエディタを開く
3. このリポジトリの `src/` 内のファイルを、**Apps Scriptエディタにコピー＆ペースト** する
4. Apps Scriptエディタから **Webアプリとしてデプロイ** し、表示されるWebアプリURLを控える
5. Slack AppのOAuth Redirect URLとSlash CommandのRequest URLに、控えたWebアプリURLを登録する
6. Slack Appをワークスペースへインストールし、Bot TokenとClient ID/Secretを控える
7. Apps Scriptの **Script Properties** に `SLACK_BOT_TOKEN`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI`, `SLACK_VERIFICATION_TOKEN` を設定する
8. スプレッドシートのメニューから **初回セットアップ** を実行する
9. Slash Commandを実行し、自分だけに見えるリンクメッセージが返ることを確認する

> プログラミングに慣れていて `clasp` を使いたい人は、末尾の[開発者向け: claspで更新する場合](#開発者向け-claspで更新する場合)を参照してください。それ以外の人はこのまま読み進めてください。

## Slack Appを作成する

1. <https://api.slack.com/apps> を開きます。
2. 「Create New App」から新しいアプリを作成します。
3. 「OAuth & Permissions」を開き、Bot Token Scopesに以下を追加します。

| 種類 | Scope | 用途 |
|---|---|---|
| Bot Token Scopes | `users:read` | Slackユーザー一覧を取得するため |
| Bot Token Scopes | `chat:write` | 自分のDMへメンション下書きを投稿するため |
| Bot Token Scopes | `im:write` | 自分とのDMチャンネルを開くため |
| Bot Token Scopes | `commands` | Slash CommandからWebアプリのリンクを返すため |

`incoming-webhook`、`users:read.email` は不要です。

OAuth & Permissions の Redirect URLs には、デプロイ後のWebアプリURLを登録してください。コード更新でデプロイURLが変わった場合は、Slack側のRedirect URLも更新します。

Bot Token Scopesを追加・変更した場合は、Slack Appをワークスペースへ再インストールしてください。

### メンバー本人ログイン（Sign in with Slack）を有効化する

このツールは、メンバー一人ひとりが **あなた本人として** 一度だけSlackログインしてから使います。Botの導入（管理者が一度だけ行う）とは別の仕組みで、対象ワークスペース以外のアカウントはログインできません。

1. Slack Appの「OAuth & Permissions」を開き、Redirect URLsにデプロイ後のWebアプリURLが登録されていることを確認します（Botと同じURLで構いません）。
2. **User Token Scopesに `openid` を追加して再インストールしないでください。** SlackのOpenID Connect用scopeは、通常のアプリインストールではなく、Webアプリ内の「Slackでログイン」ボタンから別フローで要求します。

> Slackの「Sign in with Slack」/ OpenID Connect は、`SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` をそのまま使います。メンバーログインではBotトークンを発行しません。Botトークン（`SLACK_BOT_TOKEN`）は、引き続き管理者が手動で設定します。

## Apps Scriptエディタにコードを貼り付ける

ここがこのツールの中心の作業です。GitHubのコードを1ファイルずつコピーして、Apps Scriptエディタに貼り付けていきます。

### 1. スプレッドシートからApps Scriptエディタを開く

1. 管理用に使うGoogleスプレッドシートを新規作成します。名前は分かりやすいもの（例: `Slack Mention Diff 管理用`）にします。
2. スプレッドシート上部の「拡張機能」→「Apps Script」をクリックします。新しいタブでApps Scriptエディタが開きます。
3. 画面左上のプロジェクト名（最初は「無題のプロジェクト」）をクリックして、`Slack Mention Diff` などに変更します。

### 2. ファイルを1つずつ作って貼り付ける

下の表のとおりにファイルを作り、GitHub上の同じファイルの中身をコピーして貼り付けます。コードはこのリポジトリの [`src/` フォルダ](src/) にあります。各ファイルを開いて右上のコピーボタンで全文をコピーできます。

| GitHub上のファイル（コピー元） | エディタでの操作 | エディタ上のファイル名 |
|---|---|---|
| [src/Code.gs](src/Code.gs) | 最初からある `コード.gs` を使う | `Code` |
| [src/Config.gs](src/Config.gs) | 「＋」→「スクリプト」で追加 | `Config` |
| [src/Sheets.gs](src/Sheets.gs) | 「＋」→「スクリプト」で追加 | `Sheets` |
| [src/Slack.gs](src/Slack.gs) | 「＋」→「スクリプト」で追加 | `Slack` |
| [src/Matcher.gs](src/Matcher.gs) | 「＋」→「スクリプト」で追加 | `Matcher` |
| [src/Index.html](src/Index.html) | 「＋」→「HTML」で追加 | `Index` |
| [src/Stylesheet.html](src/Stylesheet.html) | 「＋」→「HTML」で追加 | `Stylesheet` |
| [src/JavaScript.html](src/JavaScript.html) | 「＋」→「HTML」で追加 | `JavaScript` |

貼り付けのコツ:

- ファイルを追加するときの「＋」ボタンは、エディタ左側「ファイル」の右にあります。
- ファイル名を入力するとき、`.gs` や `.html` の拡張子は付けません。表の「エディタ上のファイル名」のとおり（例: `Config`）に入力してください。エディタが自動で拡張子を付けます。
- 新しく作ったファイルには最初からサンプルのコードが入っていることがあります。**いったん全部消してから**、GitHubの中身を貼り付けてください。
- 1ファイル貼り付けるたびに、上部の保存ボタン（フロッピーのアイコン）またはCtrl/Cmd+Sで保存します。

### 3. appsscript.json（マニフェスト）を貼り付ける

`appsscript.json` はアプリの設定ファイルです。最初は隠れているので、表示する設定をオンにしてから貼り付けます。

1. エディタ左側の歯車アイコン「プロジェクトの設定」を開きます。
2. 「`appsscript.json` マニフェスト ファイルをエディタで表示する」のチェックをオンにします。
3. 左側の「エディタ」に戻ると `appsscript.json` が表示されます。これを開き、中身を全部消してから [src/appsscript.json](src/appsscript.json) の内容を貼り付けて保存します。

## Script Propertiesを設定する

Apps Scriptエディタ左側の歯車アイコン「プロジェクトの設定」を開き、下のほうにある「スクリプト プロパティ」で「プロパティを追加」から以下を登録します。

`SLACK_REDIRECT_URI` には後の「Webアプリとしてデプロイする」で控えるWebアプリURLを入れます。まだデプロイしていない場合は、ここでは他のキーだけ先に登録し、デプロイ後に戻ってきて `SLACK_REDIRECT_URI` を追加しても構いません。

| キー | 値 | 必須 |
|---|---|---|
| `SLACK_BOT_TOKEN` | Slack AppのBot User OAuth Token。`xoxb-...` で始まる値 | 必須 |
| `SLACK_CLIENT_ID` | Slack AppのBasic Informationに表示されるClient ID | 必須 |
| `SLACK_CLIENT_SECRET` | Slack AppのBasic Informationに表示されるClient Secret | 必須 |
| `SLACK_REDIRECT_URI` | デプロイ後のWebアプリURL。Slack側のRedirect URLと同じ値 | 必須 |
| `SLACK_VERIFICATION_TOKEN` | Slack AppのBasic Informationに表示されるVerification Token | Slash Commandを使う場合は必須 |
| `SLACK_TEAM_ID` | 利用を許可するSlackワークスペースのTeam ID。`T` で始まる値 | 必須 |
| `SLACK_LINK_COMMAND` | リンク表示用Slash Command名。未設定なら `/mention-diff` | 任意 |
| `SPREADSHEET_ID` | 初回セットアップで自動保存されます | 手動設定不要 |

`SPREADSHEET_ID` は通常は手動設定不要です。次の初回セットアップが、バインド先スプレッドシートのIDを自動で保存します。

`SLACK_TEAM_ID` は、メンバーログイン時に「対象のSlackワークスペースのメンバーかどうか」を判定するために使います。Webアプリは名簿（表示名・本名・ユーザーID）を読める画面なので、対象外のSlackアカウントでログインされたらこのTeam ID照合で弾きます。**必ず設定してください。** Team IDは `T` で始まる値で、Slackをブラウザで開いたときのURL（`https://app.slack.com/client/T0XXXXXXX/...`）や、Slack App管理画面から確認できます。

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

貼り付けたコードを、ブラウザから使えるWebアプリとして公開します。Apps Scriptエディタの画面だけで完結します。

### 初めてデプロイするとき

1. Apps Scriptエディタの右上「デプロイ」→「新しいデプロイ」をクリックします。
2. 「種類の選択」（歯車アイコン）から「ウェブアプリ」を選びます。
3. 次のとおり設定します。

   | 項目 | 設定値 |
   |---|---|
   | 説明 | `Slack Mention Diff`（任意の分かりやすい文言） |
   | 次のユーザーとして実行 | 自分 |
   | アクセスできるユーザー | 全員 |

4. 「デプロイ」を押します。初回は権限の承認を求められるので、案内に従って自分のGoogleアカウントで許可します。
5. 表示された **ウェブアプリのURL** をコピーして控えます。このURLを後の手順で何度か使います。

> 「アクセスできるユーザー」を「全員」にしますが、URLを知っている人しか開けません。SNSなど公開の場には貼らず、サークルメンバー内だけで共有してください。

控えたWebアプリURLは、次の3か所に同じ値を設定します。

- Slack AppのOAuth & Permissions → Redirect URLs
- Slack AppのSlash Command → Request URL
- Apps ScriptのScript Properties → `SLACK_REDIRECT_URI`

設定が終わったら、WebアプリURLをブラウザで開き、「Slackユーザー一覧を更新」を押して、ユーザー件数が表示されれば成功です。

### コードを直した後にWebアプリへ反映するとき

ファイルを貼り直したり修正したりしても、デプロイし直すまでWebアプリには反映されません。**同じURLのまま**更新するには、新しいデプロイを作らず、既存デプロイのバージョンを上げます。

1. 右上「デプロイ」→「デプロイを管理」を開きます。
2. 一覧から既存のウェブアプリを選び、右上の鉛筆（編集）アイコンを押します。
3. 「バージョン」を「新バージョン」に変更します。
4. 「デプロイ」を押します。URLは変わりません。

> 「新しいデプロイ」で作り直すとURLが変わってしまい、Slack側の設定もやり直しになります。更新時は必ず「デプロイを管理」から行ってください。

## Slack Slash Commandを設定する

Slack Appの「Slash Commands」を開き、「Create New Command」から以下を設定します。

| 項目 | 設定値 |
|---|---|
| Command | `/mention-diff` |
| Request URL | デプロイ後のWebアプリURL |
| Short Description | `未完了メンバー確認ツールを開く` |
| Usage Hint | 空欄でOK |

別のコマンド名を使う場合は、Slack側のCommandとScript Propertiesの `SLACK_LINK_COMMAND` を同じ値にしてください。

Slackはリクエスト検証にSigning Secretの利用を推奨していますが、GASの `doPost(e)` ではSlackの署名ヘッダーを扱いにくいため、このアプリでは `SLACK_VERIFICATION_TOKEN` と任意の `SLACK_TEAM_ID` で検証します。

コマンド実行時は、実行した本人だけに次のようなメッセージが返ります。

```text
*未完了メンバー確認・Slackメンション作成*
下のリンクから開いてください。
対象者リストと完了者リストを照合し、未完了メンバーのSlackメンション下書きを自分のDMへ送れます。
<https://script.google.com/macros/s/.../exec|ツールを開く>
```

## 使い方

1. WebアプリURLを開きます。初めて開いたときは「Slackでログイン」を押し、対象のワークスペースで承認します。ログインは一度きりで、同じブラウザなら次回からはそのまま使えます。
2. 対象者リストに、照合したい人を1行に1人ずつ貼り付けます。
3. 完了者リストに、すでに完了している人を1行に1人ずつ貼り付けます。
4. 「未完了メンバーを確認」を押します。
5. 要確認が出た場合は、正しいSlackユーザーを選びます。
6. 「自分のDMへ送る」を押します。
7. Slack上でBotから届いたメンションの羅列をコピーし、任意のチャンネルの投稿文に貼り付けます。

対象のワークスペースのメンバーとしてログインするまでは、確認やメンバー一覧の更新はできません。対象外のSlackアカウントではログインできません。

未照合者や、未選択の要確認者はDM下書きに含まれません。要確認者が残っている場合、DM送信はできません。

## 開発者向け: claspで更新する場合

> ここはコマンドライン操作に慣れた人向けの任意の手順です。総務担当の引き継ぎでは、上の[Apps Scriptエディタにコードを貼り付ける](#apps-scriptエディタにコードを貼り付ける)方法だけで導入・更新できます。clasp を使わない場合はこのセクションは飛ばして構いません。

[clasp](https://github.com/google/clasp) を使うと、`src/` のファイルをコマンドからまとめてGASへ反映・デプロイできます。

このリポジトリでは `.clasp.json` はローカル設定として扱い、Gitには含めません。`rootDir` は `src` です。手元に `.clasp.json` がない場合は、対象のApps Scriptプロジェクトを指定して `clasp clone <scriptId>` してください。

通常の更新は次の流れです。

```sh
clasp push
clasp version "Update Slack Mention Diff"
clasp deployments
clasp deploy -i <deploymentId> -V <versionNumber> -d "Update Slack Mention Diff"
```

既存のWebアプリURLを維持したい場合は、必ず既存Webアプリの `deploymentId` を指定してください。

## トラブルシュート

| 症状 | 確認すること |
|---|---|
| 画面に「初回セットアップが未完了です」と出る | スプレッドシートメニュー「メンション抽出」→「① 初回セットアップ」を実行してください。 |
| メニューが表示されない | スプレッドシートを再読み込みしてください。それでも出ない場合は、GASがそのスプレッドシートにバインドされているか確認してください。 |
| Slackユーザー一覧を更新できない | `SLACK_BOT_TOKEN` が設定されているか、Slack Appに `users:read` があるか確認してください。 |
| Slack Appを再インストールすると「無効な権限がリクエストされました」と出る | User Token Scopesに `openid` が入っている場合は削除し、Bot Token Scopesだけで再インストールしてください。`openid` はWebアプリ内の「Slackでログイン」から別フローで要求します。 |
| Slackでログインを開始できない | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI`, `SLACK_TEAM_ID` が設定されているか、Redirect URLsがWebアプリURLと一致しているか確認してください。 |
| ログインしても「Slackでログインしてください」と出る | 対象ワークスペース（`SLACK_TEAM_ID`）のメンバーとしてログインしているか確認してください。別ワークスペースのアカウントは弾かれます。 |
| Slash Commandでリンクが返らない | Request URLがWebアプリURLになっているか、`SLACK_VERIFICATION_TOKEN` と `SLACK_LINK_COMMAND` がSlack側の設定と一致しているか確認してください。 |
| DM送信に失敗する | Slack Appに `chat:write` と `im:write` があるか、Bot Tokenが再インストール後のものか確認してください。 |
| ユーザーが未照合になる | Slackの表示名または本名に日本語氏名が入っているか確認してください。 |
| 同姓同名が自動でメンションされない | 誤メンションを避けるため、要確認として扱います。候補を選んでからDMへ送信してください。 |
| コード変更がWebアプリに反映されない | 既存デプロイを新しいバージョンへ更新してください。 |
