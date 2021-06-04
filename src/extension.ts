// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as superagent from 'superagent';

class contentProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private readonly ithome = 'https://www.ithome.com';
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
	private list: vscode.TreeItem[] = [];
	private mode: number = 0;
	private userHash: string = '';
	private last: number = -1;
	private period: number = <number>vscode.workspace.getConfiguration('ith2ome').get('defaultPeriod');
	private refreshTimer: NodeJS.Timeout | undefined;

	constructor(_mode: number) {
		this.mode = _mode;
		if (_mode == 0)
			this.userHash = <string>vscode.workspace.getConfiguration('ith2ome').get('account');
		this.refresh();
	}
	login() {
		vscode.window.showInputBox({
			ignoreFocusOut: true,
			placeHolder: '请在此处输入您的 Cookie',
			prompt: '获取 Cookie 的方法可查看插件说明'
		}).then((hash = '') => {
			vscode.workspace.getConfiguration().update('ith2ome.account', hash, true);
			this.userHash = hash;
			this.refresh();
		})
	}
	logout() {
		this.userHash = '';
		vscode.workspace.getConfiguration().update('ith2ome.account', '', true);
		vscode.window.showInformationMessage('退出成功！');
		this.refresh();
	}
	refresh() {
		if (this.refreshTimer)
			clearTimeout(this.refreshTimer);
		this.list = [];
		let keys = <string[]>vscode.workspace.getConfiguration('ith2ome').get('keyWords');
		if (this.mode == 0) {
			let loginItem = {
				label: '使用 Cookie 登录通行证登录',
				iconPath: new vscode.ThemeIcon('log-in'),
				command: {
					title: '登录',
					command: 'ith2ome.login'
				}
			};
			if (this.userHash == '') {
				this.list = [loginItem];
				this._onDidChangeTreeData.fire();
			}
			else {
				superagent.get(`https://my.ruanmei.com/api/User/Get?userHash=${this.userHash}&extra`).end((err, res) => {
					if (!res.body.ok) {
						this.userHash = '';
						vscode.window.showErrorMessage('登录失败，请检查 Cookie。');
						vscode.workspace.getConfiguration().update('ith2ome.account', '', true);
						this.list = [loginItem];
						this._onDidChangeTreeData.fire();
						return;
					}
					let userInfo = res.body.userinfo;
					this.list = [{
						label: `${userInfo.nickname}，您好！您已连续登录 ${userInfo.conldays} 天`,
						iconPath: new vscode.ThemeIcon('account'),
						id: 'account',
						contextValue: 'account'
					}, {
						label: `目前等级 ${userInfo.rank}，经验值 ${userInfo.exp}，需 ${userInfo.remainexp} 经验升级`,
						iconPath: new vscode.ThemeIcon('star-empty'),
						id: 'rank'
					}];
					this._onDidChangeTreeData.fire();
					superagent.get('https://my.ruanmei.com/api/usersign/getsigninfo?userHash=' + this.userHash).end((err2, res2) => {
						this.list.push({
							label: (res2.body.issign ? `今日已签到，` : '今日未签到，可') + `获得 ${res2.body.coin} 金币，累计金币数：${res2.body.totalcoin}`,
							iconPath: new vscode.ThemeIcon(res2.body.issign ? 'pass' : 'error'),
							id: 'signInfo'
						});
						this.list.push({
							label: `连续签到：${res2.body.cdays} 天，累计签到：${res2.body.mdays} 天`,
							iconPath: new vscode.ThemeIcon('calendar'),
							id: 'signDay'
						});
						this._onDidChangeTreeData.fire();
					});
				});
				this.refreshTimer = setTimeout(() => { this.refresh(); }, 3600000);
			}
		}
		else if (this.mode == 1) {
			let autoRefresh = <number>vscode.workspace.getConfiguration('ith2ome').get('autoRefresh');
			let blockWords = <string[]>vscode.workspace.getConfiguration('ith2ome').get('blockWords');
			superagent.get('https://api.ithome.com/json/newslist/news').end((err, res) => {
				var latest: number = 0;
				let topList = res.body.toplist;
				for (var i in topList) {
					latest = Math.max(latest, topList[i].newsid);
					var hide = false;
					for (var word in blockWords)
						if (topList[i].title.includes(blockWords[word])) {
							hide = true;
							break;
						}
					if (!hide) {
						var highlights: [number, number][] = [];
						var loc: number;
						let time = new Date(topList[i].postdate).toLocaleString('zh-CN');
						for (var j in keys)
							if ((loc = topList[i].title.indexOf(keys[j])) != -1)
								highlights.push([loc, loc + keys[j].length]);
						this.list.push({
							label: {
								highlights: highlights,
								label: topList[i].title
							},
							iconPath: new vscode.ThemeIcon('pinned'),
							id: 'top' + topList[i].newsid,
							description: time,
							resourceUri: vscode.Uri.parse(topList[i].url.substr(0, 5) == 'https' ? topList[i].url : this.ithome + topList[i].url),
							tooltip: new vscode.MarkdownString(`**${topList[i].title}**\n\n*${time}*\n\n${topList[i].description}\n\n点击数：${topList[i].hitcount}｜评论数：${topList[i].commentcount}`),
							command: {
								title: '查看内容',
								command: 'ith2ome.showContent',
								arguments: [topList[i].title, time, topList[i].newsid],
							}
						});
					}
				}
				let newsList = res.body.newslist;
				for (var i in newsList) {
					latest = Math.max(latest, newsList[i].newsid);
					if (newsList[i].newsid <= this.last) {
						if (i != '0')
							this.list.push({
								label: '上次阅读到这里，点击刷新',
								contextValue: 'refresh',
								iconPath: new vscode.ThemeIcon('eye'),
								command: {
									title: '刷新',
									command: 'ith2ome.latestRefresh'
								}
							})
						this.last = -1;
					}
					var hide = false;
					for (var word in blockWords)
						if (newsList[i].title.includes(blockWords[word])) {
							hide = true;
							break;
						}
					if (!hide) {
						var highlights: [number, number][] = [];
						var loc: number;
						let time = new Date(newsList[i].postdate).toLocaleString('zh-CN');
						for (var j in keys)
							if ((loc = newsList[i].title.indexOf(keys[j])) != -1)
								highlights.push([loc, loc + keys[j].length]);
						this.list.push({
							label: {
								highlights: highlights,
								label: newsList[i].title
							},
							iconPath: new vscode.ThemeIcon('preview'),
							id: 'news' + newsList[i].newsid,
							description: time,
							resourceUri: vscode.Uri.parse(newsList[i].url.substr(0, 5) == 'https' ? newsList[i].url : this.ithome + newsList[i].url),
							tooltip: new vscode.MarkdownString(`**${newsList[i].title}**\n\n*${time}*\n\n${newsList[i].description}\n\n点击数：${newsList[i].hitcount}｜评论数：${newsList[i].commentcount}`),
							command: {
								title: '查看内容',
								command: 'ith2ome.showContent',
								arguments: [newsList[i].title, time, newsList[i].newsid],
							}
						});
					}
				}
				this.last = latest;
				this._onDidChangeTreeData.fire();
			});
			if (autoRefresh > 0)
				this.refreshTimer = setTimeout(() => { this.refresh(); }, autoRefresh * 1000);
		}
		else if (this.mode == 2) {
			let dic = ['48', 'weekhot', 'weekcomment', 'month'];
			superagent.get('https://api.ithome.com/json/newslist/rank').end((err, res) => {
				let rankList = res.body['channel' + dic[this.period] + 'rank'];
				for (var i in rankList) {
					let time = new Date(rankList[i].postdate).toLocaleString('zh-CN')
					var highlights: [number, number][] = [];
					var loc: number;
					for (var j in keys)
						if ((loc = rankList[i].title.indexOf(keys[j])) != -1)
							highlights.push([loc, loc + keys[j].length]);
					this.list.push({
						label: {
							highlights: highlights,
							label: rankList[i].title
						},
						iconPath: new vscode.ThemeIcon('flame'),
						id: 'rank' + rankList[i].newsid,
						description: time,
						resourceUri: vscode.Uri.parse(rankList[i].url.substr(0, 5) == 'https' ? rankList[i].url : this.ithome + rankList[i].url),
						tooltip: new vscode.MarkdownString(`**${rankList[i].title}**\n\n*${time}*\n\n${rankList[i].description}\n\n点击数：${rankList[i].hitcount}｜评论数：${rankList[i].commentcount}`),
						command: {
							title: '查看内容',
							command: 'ith2ome.showContent',
							arguments: [rankList[i].title, time, rankList[i].newsid],
						}
					});
				}
				this._onDidChangeTreeData.fire();
			});
			this.refreshTimer = setTimeout(() => { this.refresh(); }, 86400000);
		}
		else if (this.mode == 3) {
			let hideThumbs = <boolean>vscode.workspace.getConfiguration('ith2ome').get('hideThumbs');
			superagent.get('http://cmt.ithome.com/api/comment/hotcommentlist/').end((err, res) => {
				let commentList = res.body.content.commentlist
				for (var i in commentList) {
					let time = new Date(commentList[i].Comment.T).toLocaleString('zh-CN')
					let locLength = commentList[i].Comment.Y.length
					this.list.push({
						label: (hideThumbs ? '' : `${commentList[i].Comment.S} | `) + commentList[i].Comment.C.replace(RegExp('[\n]+', 'g'), ' '),
						iconPath: new vscode.ThemeIcon('thumbsup'),
						id: 'comment' + commentList[i].Comment.Ci,
						description: time,
						resourceUri: vscode.Uri.parse(commentList[i].News.NewsLink),
						tooltip: new vscode.MarkdownString(`*${commentList[i].Comment.C.replace(RegExp('[\n]+', 'g'), '*\n\n*')}*\n\n**${commentList[i].News.NewsTitle}**\n\n*${time}*\n\n${commentList[i].Comment.N}` + (locLength > 6 ? ` @ ${commentList[i].Comment.Y.substring(4, locLength - 2)}` : '')),
						command: {
							title: '查看内容',
							command: 'ith2ome.showContent',
							arguments: [commentList[i].News.NewsTitle, '', commentList[i].News.NewsId],
						}
					});
				}
				this._onDidChangeTreeData.fire();
			});
			this.refreshTimer = setTimeout(() => { this.refresh(); }, 86400000);
		}
	}
	switchPeriod(p: number) {
		this.period = p;
		this.refresh();
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
	let currentPanel: vscode.WebviewPanel | undefined = undefined;
	let account = new contentProvider(0);
	let latest = new contentProvider(1);
	let hot = new contentProvider(2);
	let comment = new contentProvider(3);
	var config = vscode.workspace.getConfiguration('ith2ome');
	var showImages = <boolean>config.get('showImages');
	var showRelated = <boolean>config.get('showRelated');
	vscode.window.registerTreeDataProvider('account', account);
	vscode.window.registerTreeDataProvider('latest', latest);
	vscode.window.registerTreeDataProvider('hot', hot);
	vscode.window.registerTreeDataProvider('comment', comment);
	context.subscriptions.push(
		vscode.commands.registerCommand('ith2ome.login', () => {
			account.login();
		}),
		vscode.commands.registerCommand('ith2ome.logout', () => {
			account.logout();
		}),
		vscode.commands.registerCommand('ith2ome.accountRefresh', () => {
			account.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.showContent', (title: string, time: string, newsid: number) => {
			const columnToShowIn = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
			if (currentPanel)
				currentPanel.reveal(columnToShowIn);
			else
				currentPanel = vscode.window.createWebviewPanel(
					'content',
					'ITH2Ome: 预览',
					{ preserveFocus: true, viewColumn: vscode.ViewColumn.One }
				);
			superagent.get('https://api.ithome.com/json/newscontent/' + newsid).end((err, res) => {
				(<vscode.WebviewPanel>currentPanel).webview.html = `<h1>${title}</h1><h3>新闻源：${res.body.newssource}（${res.body.newsauthor}）｜责编：${res.body.z}</h3><h4>${time}</h4>${showImages ? res.body.detail : res.body.detail.replace(RegExp('<img.*?>', 'g'), '#图片已屏蔽#')}`;
				if (showRelated)
					superagent.get('http://api.ithome.com/json/tags/0' + String(newsid).substring(0, 3) + `/${newsid}.json`)
						.responseType('text').end((err2, res2) => {
							(<vscode.WebviewPanel>currentPanel).webview.html += `<hr><h3>相关文章</h3><ul>`
							let relaList = JSON.parse(res2.body.toString().substr(16));
							for (var i in relaList)
								(<vscode.WebviewPanel>currentPanel).webview.html += `<li><a href="${relaList[i].url}">${relaList[i].newstitle}</a></li>`;
							(<vscode.WebviewPanel>currentPanel).webview.html += '</ul>'
						})
			})
			currentPanel.onDidDispose(
				() => {
					currentPanel = undefined;
				},
				null,
				context.subscriptions
			)
		}),
		vscode.commands.registerCommand('ith2ome.share', (item: vscode.TreeItem) => {
			let text = (<vscode.MarkdownString>item.tooltip).value.replace(RegExp('[\*]+', 'g'), '');
			let line3 = text.lastIndexOf('\n\n');
			let line2 = text.lastIndexOf('\n\n', line3 - 2);
			let line1 = text.lastIndexOf('\n\n', line2 - 2);
			let dic = (<string>item.id)[0] != 'c' ? ['标题：', '\n时间：', '\n内容：', '\n'] : ['', '\n\n标题：', '\n时间：', '\n用户：']
			vscode.env.clipboard.writeText(dic[0] + text.substring(0, line1).replace(RegExp('[\n]+', 'g'), '\n') + dic[1] + text.substring(line1 + 2, line2) + dic[2] + text.substring(line2 + 2, line3) + dic[3] + text.substring(line3 + 2) + '\n' + item.resourceUri).then(() => {
				vscode.window.showInformationMessage('新闻复制成功！');
			});
		}),
		vscode.commands.registerCommand('ith2ome.openBrowser', (item: vscode.TreeItem) => {
			vscode.commands.executeCommand('vscode.open', item.resourceUri);
		}),
		vscode.commands.registerCommand('ith2ome.latestRefresh', () => {
			config = vscode.workspace.getConfiguration('ith2ome');
			showImages = <boolean>config.get('showImages');
			showRelated = <boolean>config.get('showRelated');
			latest.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.hotRefresh', () => {
			config = vscode.workspace.getConfiguration('ith2ome');
			showImages = <boolean>config.get('showImages');
			showRelated = <boolean>config.get('showRelated');
			hot.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.daily', () => {
			hot.switchPeriod(0);
		}),
		vscode.commands.registerCommand('ith2ome.weekly', () => {
			hot.switchPeriod(1);
		}),
		vscode.commands.registerCommand('ith2ome.comment', () => {
			hot.switchPeriod(2);
		}),
		vscode.commands.registerCommand('ith2ome.monthly', () => {
			hot.switchPeriod(3);
		}),
		vscode.commands.registerCommand('ith2ome.commentRefresh', () => {
			config = vscode.workspace.getConfiguration('ith2ome');
			showImages = <boolean>config.get('showImages');
			showRelated = <boolean>config.get('showRelated');
			comment.refresh();
		})
	);
}

export function deactivate() { }
