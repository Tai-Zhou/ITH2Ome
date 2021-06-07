// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as superagent from 'superagent';

let config: vscode.WorkspaceConfiguration;
var userHash: string;
var showImages: boolean;
var showRelated: boolean;
var autoRefresh: number;
var keyWords: string[];
var keysLength: number[];
var blockWords: string[];
var period: number;
const periodDic = ['48', 'weekhot', 'weekcomment', 'month'];
var showThumbs: boolean;
var lastNewsId: number = -1;

function refreshConfig() {
	config = vscode.workspace.getConfiguration('ith2ome');
	userHash = <string>config.get('account');
	showImages = <boolean>config.get('showImages');
	showRelated = <boolean>config.get('showRelated');
	autoRefresh = <number>config.get('autoRefresh');
	keyWords = <string[]>config.get('keyWords');
	keysLength = new Array(keyWords.length);
	for (var i in keyWords)
		keysLength[i] = keyWords[i].length;
	blockWords = <string[]>config.get('blockWords');
	showThumbs = <boolean>config.get('showThumbs');
}

function show(title: string): boolean {
	for (var i in blockWords)
		if (title.includes(blockWords[i]))
			return false;
	return true;
}

function highlight(title: string): [number, number][] {
	var highlights: [number, number][] = [];
	var loc: number;
	for (var i in keyWords)
		if ((loc = title.indexOf(keyWords[i])) != -1)
			highlights.push([loc, loc + keysLength[i]]);
	return highlights;
}

function linkCheck(url: string): vscode.Uri {
	return vscode.Uri.parse(url.substr(0, 5) == 'https' ? url : 'https://www.ithome.com' + url);
}

class ith2omeItem extends vscode.TreeItem {
	shareInfo?: string;
}

class ith2omeShowContent implements vscode.Command {
	title = '查看内容';
	command = 'ith2ome.showContent';
	arguments: string[];
	constructor(title: string, time: string, id: string) {
		this.arguments = [title, time, id];
	}
}

class contentProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private update = new vscode.EventEmitter<vscode.TreeItem | void>();
	readonly onDidChangeTreeData = this.update.event;
	private list: ith2omeItem[] = [];
	private mode: number;
	private refreshTimer: NodeJS.Timeout | undefined;

	constructor(_mode: number) {
		this.mode = _mode;
		this.refresh();
	}
	refresh() {
		if (this.refreshTimer)
			clearTimeout(this.refreshTimer);
		this.list = [];
		if (this.mode == 0) {
			if (userHash == '') {
				this.list = [{
					label: '使用 Cookie 登录通行证',
					iconPath: new vscode.ThemeIcon('log-in'),
					description: '方法见 README',
					command: { title: '登录', command: 'ith2ome.login' }
				}];
				this.update.fire();
			}
			else {
				superagent.get(`https://my.ruanmei.com/api/User/Get?userHash=${userHash}&extra`).end((err, res) => {
					if (!res.body.ok) {
						userHash = '';
						config.update('account', '', true);
						vscode.window.showErrorMessage('登录失败，请检查 Cookie。');
						this.refresh();
						return;
					}
					let userInfo = res.body.userinfo;
					this.list = [{
						label: `${userInfo.nickname}，您好！您已连续登录 ${userInfo.conldays} 天`,
						iconPath: new vscode.ThemeIcon('account'),
						contextValue: 'account'
					}, {
						label: `目前等级 ${userInfo.rank}，经验值 ${userInfo.exp}，需 ${userInfo.remainexp} 经验升级`,
						iconPath: new vscode.ThemeIcon('star-empty'),
					}];
					this.update.fire();
					superagent.get('https://my.ruanmei.com/api/usersign/getsigninfo?userHash=' + userHash).end((err2, res2) => {
						this.list.push({
							label: (res2.body.issign ? `今日已签到，` : '今日未签到，可') + `获得 ${res2.body.coin} 金币，累计金币数：${res2.body.totalcoin}`,
							iconPath: new vscode.ThemeIcon(res2.body.issign ? 'pass' : 'error'),
						});
						this.list.push({
							label: `连续签到：${res2.body.cdays} 天，累计签到：${res2.body.mdays} 天`,
							iconPath: new vscode.ThemeIcon('calendar'),
						});
						this.update.fire();
					});
				});
				this.refreshTimer = setTimeout(() => { this.refresh(); }, 3600000);
			}
		}
		else if (this.mode == 1) {
			superagent.get('https://api.ithome.com/json/newslist/news').end((err, res) => {
				var latest: number = 0;
				let topList = res.body.toplist;
				for (var i in topList) {
					latest = Math.max(latest, topList[i].newsid);
					if (show(topList[i].title)) {
						let time = new Date(topList[i].postdate).toLocaleString('zh-CN');
						this.list.push({
							label: { highlights: highlight(topList[i].title), label: topList[i].title },
							iconPath: new vscode.ThemeIcon('pinned'),
							id: 'top' + topList[i].newsid,
							description: time,
							resourceUri: linkCheck(topList[i].url),
							tooltip: new vscode.MarkdownString(`**${topList[i].title}**\n\n*${time}*\n\n${topList[i].description}\n\n点击数：${topList[i].hitcount}｜评论数：${topList[i].commentcount}`),
							command: new ith2omeShowContent(topList[i].title, time, topList[i].newsid),
							shareInfo: `标题：${topList[i].title}\n时间：${time}\n内容：${topList[i].description}\n点击数：${topList[i].hitcount}｜评论数：${topList[i].commentcount}\n`
						});
					}
				}
				let newsList = res.body.newslist;
				for (var i in newsList) {
					latest = Math.max(latest, newsList[i].newsid);
					if (newsList[i].newsid <= lastNewsId) {
						if (i != '0')
							this.list.push({
								label: '上次阅读到这里，点击刷新',
								contextValue: 'refresh',
								iconPath: new vscode.ThemeIcon('eye'),
								command: { title: '刷新', command: 'ith2ome.latestRefresh' }
							})
						lastNewsId = -1;
					}
					if (show(newsList[i].title)) {
						let time = new Date(newsList[i].postdate).toLocaleString('zh-CN');
						this.list.push({
							label: { highlights: highlight(newsList[i].title), label: newsList[i].title },
							iconPath: new vscode.ThemeIcon('preview'),
							id: 'news' + newsList[i].newsid,
							description: time,
							resourceUri: linkCheck(newsList[i].url),
							tooltip: new vscode.MarkdownString(`**${newsList[i].title}**\n\n*${time}*\n\n${newsList[i].description}\n\n点击数：${newsList[i].hitcount}｜评论数：${newsList[i].commentcount}`),
							command: new ith2omeShowContent(newsList[i].title, time, newsList[i].newsid),
							shareInfo: `标题：${newsList[i].title}\n时间：${time}\n内容：${newsList[i].description}\n点击数：${newsList[i].hitcount}｜评论数：${newsList[i].commentcount}\n`
						});
					}
				}
				lastNewsId = latest;
				this.update.fire();
			});
			if (autoRefresh > 0)
				this.refreshTimer = setTimeout(() => { this.refresh(); }, autoRefresh * 1000);
		}
		else if (this.mode == 2) {
			superagent.get('https://api.ithome.com/json/newslist/rank').end((err, res) => {
				let rankList = res.body['channel' + periodDic[period] + 'rank'];
				for (var i in rankList) {
					let time = new Date(rankList[i].postdate).toLocaleString('zh-CN');
					this.list.push({
						label: { highlights: highlight(rankList[i].title), label: rankList[i].title },
						iconPath: new vscode.ThemeIcon('flame'),
						id: 'rank' + rankList[i].newsid,
						description: time,
						resourceUri: linkCheck(rankList[i].url),
						tooltip: new vscode.MarkdownString(`**${rankList[i].title}**\n\n*${time}*\n\n${rankList[i].description}\n\n点击数：${rankList[i].hitcount}｜评论数：${rankList[i].commentcount}`),
						command: new ith2omeShowContent(rankList[i].title, time, rankList[i].newsid),
						shareInfo: `标题：${rankList[i].title}\n时间：${time}\n内容：${rankList[i].description}\n点击数：${rankList[i].hitcount}｜评论数：${rankList[i].commentcount}`
					});
				}
				this.update.fire();
			});
			this.refreshTimer = setTimeout(() => { this.refresh(); }, 86400000);
		}
		else if (this.mode == 3) {
			superagent.get('http://cmt.ithome.com/api/comment/hotcommentlist/').end((err, res) => {
				let commentList = res.body.content.commentlist
				for (var i in commentList) {
					let time = new Date(commentList[i].Comment.T).toLocaleString('zh-CN');
					let locLength = commentList[i].Comment.Y.length;
					let user = commentList[i].Comment.N + (locLength > 6 ? ` @ ${commentList[i].Comment.Y.substring(4, locLength - 2)}` : '');
					this.list.push({
						label: (showThumbs ? `${commentList[i].Comment.S} | ` : '') + commentList[i].Comment.C.replace(RegExp('[\n]+', 'g'), ' '),
						iconPath: new vscode.ThemeIcon('thumbsup'),
						id: 'comment' + commentList[i].Comment.Ci,
						description: time,
						resourceUri: linkCheck(commentList[i].News.NewsLink),
						tooltip: new vscode.MarkdownString(`*${commentList[i].Comment.C.replace(RegExp('[\n]+', 'g'), '*\n\n*')}*\n\n**${commentList[i].News.NewsTitle}**\n\n*${time}*\n\n${user}`),
						command: new ith2omeShowContent(commentList[i].News.NewsTitle, '', commentList[i].News.NewsId),
						shareInfo: `${commentList[i].Comment.C}\n\n标题：${commentList[i].News.NewsTitle}\n时间：${time}\n用户：${user}\n`
					});
				}
				this.update.fire();
			});
			this.refreshTimer = setTimeout(() => { this.refresh(); }, 86400000);
		}
	}
	getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
		if (element)
			return [];
		return this.list;
	}
	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	refreshConfig();
	period = <number>config.get('defaultPeriod');
	let currentPanel: vscode.WebviewPanel | undefined = undefined;
	let account = new contentProvider(0);
	let latest = new contentProvider(1);
	let hot = new contentProvider(2);
	let comment = new contentProvider(3);
	vscode.window.registerTreeDataProvider('account', account);
	vscode.window.registerTreeDataProvider('latest', latest);
	vscode.window.registerTreeDataProvider('hot', hot);
	vscode.window.registerTreeDataProvider('comment', comment);
	context.subscriptions.push(
		vscode.commands.registerCommand('ith2ome.login', () => {
			vscode.window.showInputBox({
				ignoreFocusOut: true,
				placeHolder: '请在此处输入您的 Cookie',
				prompt: '获取 Cookie 的方法可查看插件说明'
			}).then((hash = '') => {
				userHash = hash;
				config.update('account', hash, true).then(() => {
					account.refresh();
				});
			})
		}),
		vscode.commands.registerCommand('ith2ome.logout', () => {
			userHash = '';
			config.update('account', '', true).then(() => {
				vscode.window.showInformationMessage('退出成功！');
				account.refresh();
			});
		}),
		vscode.commands.registerCommand('ith2ome.accountRefresh', () => {
			refreshConfig();
			account.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.showContent', (title: string, time: string, id: number) => {
			if (currentPanel)
				currentPanel.reveal(vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined);
			else
				currentPanel = vscode.window.createWebviewPanel('content', 'ITH2Ome: 预览', { preserveFocus: true, viewColumn: vscode.ViewColumn.One });
			superagent.get('https://api.ithome.com/json/newscontent/' + id).end((err, res) => {
				currentPanel!.webview.html = (res.body.btheme ? '<head><style>body{filter:grayscale(100%)}</style></head>' : '') + `<h1>${title}</h1><h3>新闻源：${res.body.newssource}（${res.body.newsauthor}）｜责编：${res.body.z}</h3><h4>${time}</h4>${showImages ? res.body.detail : res.body.detail.replace(RegExp('<img.*?>', 'g'), '#图片已屏蔽#')}`;
				if (showRelated)
					superagent.get('http://api.ithome.com/json/tags/0' + String(id).substring(0, 3) + `/${id}.json`).responseType('text').end((err2, res2) => {
						currentPanel!.webview.html += `<hr><h3>相关文章</h3><ul>`;
						let relaList = JSON.parse(res2.body.toString().substr(16));
						for (var i in relaList)
							currentPanel!.webview.html += `<li><a href="${relaList[i].url}">${relaList[i].newstitle}</a></li>`;
						currentPanel!.webview.html += '</ul>';
					});
			})
			currentPanel.onDidDispose(() => { currentPanel = undefined; }, null, context.subscriptions);
		}),
		vscode.commands.registerCommand('ith2ome.share', (item: ith2omeItem) => {
			vscode.env.clipboard.writeText(item.shareInfo! + item.resourceUri).then(() => {
				vscode.window.showInformationMessage('新闻复制成功！');
			});
		}),
		vscode.commands.registerCommand('ith2ome.openBrowser', (item: vscode.TreeItem) => {
			vscode.commands.executeCommand('vscode.open', item.resourceUri);
		}),
		vscode.commands.registerCommand('ith2ome.latestRefresh', () => {
			refreshConfig();
			latest.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.hotRefresh', () => {
			refreshConfig();
			hot.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.daily', () => {
			period = 0;
			hot.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.weekly', () => {
			period = 1;
			hot.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.comment', () => {
			period = 2;
			hot.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.monthly', () => {
			period = 3;
			hot.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.commentRefresh', () => {
			refreshConfig();
			comment.refresh();
		})
	);
}

export function deactivate() { }
