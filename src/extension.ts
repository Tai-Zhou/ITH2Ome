import * as vscode from 'vscode';
import * as superagent from 'superagent';

let config: vscode.WorkspaceConfiguration; // 所有设置信息
var userHash: string; // 通行证 Cookie
var signReminder: boolean; // 签到提醒
var showImages: boolean; // 显示图片
var showRelated: boolean; // 显示相关文章
var autoRefresh: number; // “最新”刷新间隔
var keyWords: string[]; // 关键词列表
var keysLength: number[]; // 关键词长度
var blockWords: string[]; // 屏蔽词列表
var period: number; // “热榜”榜单，仅在启动时从设置中读取
const periodDic = ['48', 'weekhot', 'weekcomment', 'month']; // “热榜”榜单字典
var showThumbs: boolean; // “热评”显示点赞数
var lastNewsId: number = -1; // “最新”最后阅读标记，用于显示上次阅读位置

function refreshConfig() { // 刷新设置，仅在手动刷新时运行
	config = vscode.workspace.getConfiguration('ith2ome');
	userHash = <string>config.get('account');
	signReminder = <boolean>config.get('signReminder');
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

function show(title: string): boolean { // 返回是否显示该条新闻
	for (var i in blockWords)
		if (title.includes(blockWords[i]))
			return false;
	return true;
}

function highlight(title: string): [number, number][] { // 返回该条新闻关键词位置
	var highlights: [number, number][] = [];
	var loc: number;
	for (var i in keyWords)
		if ((loc = title.indexOf(keyWords[i])) != -1)
			highlights.push([loc, loc + keysLength[i]]);
	return highlights;
}

function linkCheck(url: string): vscode.Uri { // 检查链接是否以 https:// 开始
	return vscode.Uri.parse(url.substr(0, 5) == 'https' ? url : 'https://www.ithome.com' + url);
}

class ith2omeItem extends vscode.TreeItem { // 在 TreeItem 基础上增加 shareInfo 用于复制链接
	shareInfo?: string;
}

class ith2omeShowContent implements vscode.Command { // 在 VSCode 中查看的命令，用于“最新”、“热榜”与“热评”
	title = '查看内容';
	command = 'ith2ome.showContent';
	arguments: string[];
	constructor(title: string, time: string, id: string) {
		this.arguments = [title, time, id];
	}
}

class contentProvider implements vscode.TreeDataProvider<vscode.TreeItem> { // 为 View 提供内容
	private update = new vscode.EventEmitter<vscode.TreeItem | void>(); // 用于触发刷新
	readonly onDidChangeTreeData = this.update.event;
	private list: ith2omeItem[] = []; // 项目列表
	private mode: number; // 工作模式，0 为“通行证”，1 为“最新”，2 为“热榜”，3 为“热评”
	private refreshTimer: NodeJS.Timeout | undefined; // 自动刷新计时器

	constructor(_mode: number) {
		this.mode = _mode;
		this.refresh();
	}
	refresh() {
		if (this.refreshTimer) // 若为手动刷新
			clearTimeout(this.refreshTimer); // 清除下一次自动刷新计时器
		this.list = []; // 清除项目列表
		if (this.mode == 0) { // “通行证”
			if (userHash == '') { // Cookie 为空
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
					if (!res.body.ok) { // 失败
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
						if (signReminder && !res2.body.issign)
							vscode.window.showInformationMessage(`今日尚未签到，可获得 ${res2.body.coin} 金币～`);
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
				this.refreshTimer = setTimeout(() => { this.refresh(); }, 3600000); // 设置自动刷新时间
			}
		}
		else if (this.mode == 1) { // “最新”
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
				this.refreshTimer = setTimeout(() => { this.refresh(); }, autoRefresh * 1000); // 设置自动刷新时间
		}
		else if (this.mode == 2) { // “热榜”
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
			this.refreshTimer = setTimeout(() => { this.refresh(); }, 86400000); // 设置自动刷新时间
		}
		else if (this.mode == 3) { // “热评”
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
			this.refreshTimer = setTimeout(() => { this.refresh(); }, 86400000); // 设置自动刷新时间
		}
	}
	getChildren(element?: vscode.TreeItem): vscode.TreeItem[] { // 获取项目列表
		if (element)
			return [];
		return this.list;
	}
	getTreeItem(element: vscode.TreeItem): vscode.TreeItem { // 获取项目
		return element;
	}
}

export function activate(context: vscode.ExtensionContext) {
	refreshConfig();
	period = <number>config.get('defaultPeriod'); // 仅在启动时从设置中读取
	let panel: vscode.WebviewPanel | undefined = undefined; // 查看内容窗口
	let account = new contentProvider(0);
	let latest = new contentProvider(1);
	let hot = new contentProvider(2);
	let comment = new contentProvider(3);
	vscode.window.registerTreeDataProvider('account', account);
	vscode.window.registerTreeDataProvider('latest', latest);
	vscode.window.registerTreeDataProvider('hot', hot);
	vscode.window.registerTreeDataProvider('comment', comment);
	context.subscriptions.push(
		vscode.commands.registerCommand('ith2ome.login', () => { // 登录通行证
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
		vscode.commands.registerCommand('ith2ome.logout', () => { // 退出通行证
			userHash = '';
			config.update('account', '', true).then(() => {
				vscode.window.showInformationMessage('退出成功！');
				account.refresh();
			});
		}),
		vscode.commands.registerCommand('ith2ome.accountRefresh', () => { // 刷新“通行证”
			refreshConfig();
			account.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.showContent', (title: string, time: string, id: number) => { // 显示新闻内容
			if (panel)
				panel.reveal(vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined);
			else
				panel = vscode.window.createWebviewPanel('content', 'ITH2Ome: 预览', { preserveFocus: true, viewColumn: vscode.ViewColumn.One });
			superagent.get('https://api.ithome.com/json/newscontent/' + id).end((err, res) => {
				panel!.webview.html = (res.body.btheme ? '<head><style>body{filter:grayscale(100%)}</style></head>' : '') + `<h1>${title}</h1><h3>新闻源：${res.body.newssource}（${res.body.newsauthor}）｜责编：${res.body.z}</h3><h4>${time}</h4>${showImages ? res.body.detail : res.body.detail.replace(RegExp('<img.*?>', 'g'), '#图片已屏蔽#')}`;
				if (showRelated) // 显示相关文章
					superagent.get('http://api.ithome.com/json/tags/0' + String(id).substring(0, 3) + `/${id}.json`).responseType('text').end((err2, res2) => {
						panel!.webview.html += `<hr><h3>相关文章</h3><ul>`;
						let relaList = JSON.parse(res2.body.toString().substr(16));
						for (var i in relaList)
							panel!.webview.html += `<li><a href="${relaList[i].url}">${relaList[i].newstitle}</a></li>`;
						panel!.webview.html += '</ul>';
					});
			})
			panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
		}),
		vscode.commands.registerCommand('ith2ome.share', (item: ith2omeItem) => { // 分享新闻
			vscode.env.clipboard.writeText(item.shareInfo! + item.resourceUri).then(() => {
				vscode.window.showInformationMessage('新闻复制成功！');
			});
		}),
		vscode.commands.registerCommand('ith2ome.openBrowser', (item: vscode.TreeItem) => { // 在浏览器中查看
			vscode.commands.executeCommand('vscode.open', item.resourceUri);
		}),
		vscode.commands.registerCommand('ith2ome.latestRefresh', () => { // 刷新“最新”
			refreshConfig();
			latest.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.hotRefresh', () => { // 刷新“热榜”
			refreshConfig();
			hot.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.daily', () => { // “热榜”切换为日榜
			period = 0;
			hot.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.weekly', () => { // “热榜”切换为周榜
			period = 1;
			hot.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.comment', () => { // “热榜”切换为热评
			period = 2;
			hot.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.monthly', () => { // “热榜”切换为月榜
			period = 3;
			hot.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.commentRefresh', () => {  // 刷新“热评”
			refreshConfig();
			comment.refresh();
		})
	);
}

export function deactivate() { }
