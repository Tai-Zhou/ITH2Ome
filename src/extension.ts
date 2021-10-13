import * as vscode from 'vscode';
import * as superagent from 'superagent';

let config: vscode.WorkspaceConfiguration; // 所有设置信息
let userHash: string; // 通行证 Cookie
let signReminder: boolean; // 签到提醒
let showImages: boolean; // 显示图片
let showRelated: boolean; // 显示相关文章
let showComment: boolean; // 显示网友评论
let commentOrder: boolean; // 网友评论顺序
let commentOrderWord: string; // 网友评论顺序字典
let autoRefresh: number; // “最新”刷新间隔
let keyWords: string[]; // 关键词列表
let keysLength: number[]; // 关键词长度
let blockWords: string[]; // 屏蔽词列表
let period: number; // “热榜”榜单，仅在启动时从设置中读取
const periodDic = ['48', 'weekhot', 'weekcomment', 'month']; // “热榜”榜单字典
let showThumbs: boolean; // “热评”显示点赞数
let latestNewsId: number = 0; // “最新”最新消息标记，用于显示上次阅读位置
let lastReadId: number = 0; // “最新”最后阅读标记，用于显示上次阅读位置
const lastRead: vscode.TreeItem = {
	label: '上次阅读到这里，点击刷新',
	iconPath: new vscode.ThemeIcon('refresh'),
	command: { title: '刷新', command: 'ith2ome.latestRefresh' }
};

function refreshConfig() { // 刷新设置，仅在手动刷新时运行
	config = vscode.workspace.getConfiguration('ith2ome');
	userHash = <string>config.get('account');
	signReminder = <boolean>config.get('signReminder');
	showImages = <boolean>config.get('showImages');
	showRelated = <boolean>config.get('showRelated');
	showComment = <boolean>config.get('showComment');
	commentOrder = <boolean>config.get('commentOrder');
	commentOrderWord = commentOrder ? '早' : '新';
	autoRefresh = <number>config.get('autoRefresh');
	keyWords = <string[]>config.get('keyWords');
	keysLength = new Array(keyWords.length);
	for (let i in keyWords)
		keysLength[i] = keyWords[i].length;
	blockWords = <string[]>config.get('blockWords');
	showThumbs = <boolean>config.get('showThumbs');
}

function show(title: string): boolean { // 返回是否显示该条新闻
	for (let i in blockWords)
		if (title.search(RegExp(blockWords[i], 'i')) != -1)
			return false;
	return true;
}

function highlight(title: string): [number, number][] { // 返回该条新闻关键词位置
	let highlights: [number, number][] = [];
	let loc: number;
	for (let i in keyWords)
		if ((loc = title.search(RegExp(keyWords[i], 'i'))) != -1)
			highlights.push([loc, loc + keysLength[i]]);
	return highlights;
}

function linkCheck(url: string): vscode.Uri { // 检查链接是否以 https:// 开始
	return vscode.Uri.parse(url.substring(0, 5) == 'https' ? url : 'https://www.ithome.com' + url);
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

function newsFormat(news: any, icon: string): ith2omeItem {
	let time = new Date(news.postdate).toLocaleString('zh-CN');
	let highlights = highlight(news.title);
	return {
		label: { highlights: highlights, label: news.title },
		contextValue: 'ith2ome.article',
		iconPath: new vscode.ThemeIcon(icon.length == 7 && highlights.length ? 'lightbulb' : icon),
		id: icon + news.newsid,
		description: time,
		resourceUri: linkCheck(news.url),
		tooltip: new vscode.MarkdownString(`**${news.title}**\n\n![封面图](${news.image})\n\n*${time}*\n\n${news.description}\n\n点击数：${news.hitcount}｜评论数：${news.commentcount}`),
		command: new ith2omeShowContent(news.title, time, news.newsid),
		shareInfo: `标题：${news.title}\n时间：${time}\n内容：${news.description}\n点击数：${news.hitcount}｜评论数：${news.commentcount}\n`
	};
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
	refresh(refreshType: number = 0) { // 0 为手动刷新，1 为自动刷新，其余为加载更多的时间戳（仅用于“最新”）
		if (this.refreshTimer) // 若为手动刷新
			clearTimeout(this.refreshTimer); // 清除下一次自动刷新计时器
		if (refreshType < 2)
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
						contextValue: 'ith2ome.account'
					}, {
						label: `目前等级 ${userInfo.rank}，经验值 ${userInfo.exp}，需 ${userInfo.remainexp} 经验升级`,
						iconPath: new vscode.ThemeIcon('star-empty')
					}];
					this.update.fire();
					superagent.get('https://my.ruanmei.com/api/usersign/getsigninfo?userHash=' + userHash).end((err2, res2) => {
						if (signReminder && !res2.body.issign)
							vscode.window.showInformationMessage(`今日尚未签到，可获得 ${res2.body.coin} 金币～`);
						this.list.push({
							label: (res2.body.issign ? `今日已签到，` : '今日未签到，可') + `获得 ${res2.body.coin} 金币，累计金币数：${res2.body.totalcoin}`,
							iconPath: new vscode.ThemeIcon(res2.body.issign ? 'pass' : 'error')
						});
						this.list.push({
							label: `连续签到：${res2.body.cdays} 天，累计签到：${res2.body.mdays} 天`,
							iconPath: new vscode.ThemeIcon('calendar')
						});
						this.update.fire();
					});
				});
				this.refreshTimer = setTimeout(() => { this.refresh(); }, 3600000); // 设置自动刷新时间
			}
		}
		else if (this.mode == 1) { // “最新”
			if (refreshType < 2) {
				if (refreshType == 0) // 仅在手动刷新时更新最后阅读标记
					lastReadId = latestNewsId;
				if (lastReadId < 0) // lastReadId < 0 表示最后阅读标记已插入，刷新时需设为正
					lastReadId = -lastReadId;
				superagent.get('https://api.ithome.com/json/newslist/news').end((err, res) => {
					let topList = res.body.toplist;
					for (let i in topList)
						if (show(topList[i].title))
							this.list.push(newsFormat(topList[i], 'pinned'));
					let newsList = res.body.newslist;
					for (let i in newsList) {
						let orderTime = new Date(newsList[i].orderdate).getTime();
						latestNewsId = Math.max(latestNewsId, orderTime);
						if (orderTime <= lastReadId) {
							if (i != '0')
								this.list.push(lastRead);
							lastReadId = -lastReadId;
						}
						if (show(newsList[i].title))
							this.list.push(newsFormat(newsList[i], newsList[i].aid ? 'tag' : 'preview'));
					}
					this.list.push({
						label: '加载更多数据',
						iconPath: new vscode.ThemeIcon('eye'),
						command: { title: '加载更多数据', command: 'ith2ome.latestRefresh', arguments: [new Date(newsList[newsList.length - 1].orderdate).getTime()] }
					});
					this.update.fire();
				});
			}
			else { // 加载更多数据
				this.list.pop();
				superagent.get('https://m.ithome.com/api/news/newslistpageget?ot=' + refreshType).end((err, res) => {
					let newsList = res.body.Result;
					for (let i in newsList) {
						if (lastReadId > 0 && new Date(newsList[i].orderdate).getTime() <= lastReadId) {
							this.list.push(lastRead);
							lastReadId = -lastReadId;
						}
						if (show(newsList[i].title))
							this.list.push(newsFormat(newsList[i], newsList[i].url.search('lapin') != -1 ? 'tag' : 'preview'));
					}
					this.list.push({
						label: '加载更多数据',
						iconPath: new vscode.ThemeIcon('eye'),
						command: { title: '加载更多数据', command: 'ith2ome.latestRefresh', arguments: [new Date(newsList[newsList.length - 1].orderdate).getTime()] }
					});
					this.update.fire();
				});
			}
			if (autoRefresh > 0)
				this.refreshTimer = setTimeout(() => { this.refresh(1); }, autoRefresh * 1000); // 设置自动刷新时间
		}
		else if (this.mode == 2) { // “热榜”
			superagent.get('https://api.ithome.com/json/newslist/rank').end((err, res) => {
				let rankList = res.body['channel' + periodDic[period] + 'rank'];
				for (let i in rankList)
					this.list.push(newsFormat(rankList[i], 'flame'));
				this.update.fire();
			});
			this.refreshTimer = setTimeout(() => { this.refresh(); }, 86400000); // 设置自动刷新时间
		}
		else if (this.mode == 3) { // “热评”
			superagent.get('http://cmt.ithome.com/api/comment/hotcommentlist/').end((err, res) => {
				let commentList = res.body.content.commentlist;
				for (let i in commentList) {
					let time = new Date(commentList[i].Comment.T).toLocaleString('zh-CN');
					let locLength = commentList[i].Comment.Y.length;
					let user = commentList[i].Comment.N + (locLength > 6 ? ` @ ${commentList[i].Comment.Y.substring(4, locLength - 2)}` : '');
					this.list.push({
						label: (showThumbs ? `${commentList[i].Comment.S} | ` : '') + commentList[i].Comment.C.replace(RegExp('[\n]+', 'g'), ' '),
						contextValue: 'ith2ome.article',
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
	vscode.window.registerTreeDataProvider('ith2ome.account', account);
	vscode.window.registerTreeDataProvider('ith2ome.latest', latest);
	vscode.window.registerTreeDataProvider('ith2ome.hot', hot);
	vscode.window.registerTreeDataProvider('ith2ome.comment', comment);
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
			});
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
				panel = vscode.window.createWebviewPanel('content', 'ITH2Ome：预览', { preserveFocus: true, viewColumn: vscode.ViewColumn.One });
			superagent.get('https://api.ithome.com/json/newscontent/' + id).end((err, res) => {
				panel!.webview.html = (res.body.btheme ? '<head><style>body{filter:grayscale(100%)}</style></head>' : '') + `<h1>${title}</h1><h3>新闻源：${res.body.newssource}（${res.body.newsauthor}）｜责编：${res.body.z}</h3><h4>${time}</h4>${showImages ? res.body.detail : res.body.detail.replace(RegExp('<img.*?>', 'g'), '#图片已屏蔽#')}`;
				if (showRelated) { // 显示相关文章
					panel!.webview.html += `<hr><h2>相关文章</h2>`;
					superagent.get(`https://api.ithome.com/json/tags/0${Math.floor(id / 1000)}/${id}.json`).responseType('text').end((err2, res2) => {
						let text = '<h2>相关文章</h2><ul>';
						let relaList = JSON.parse(res2.body.toString().substring(16));
						for (let i in relaList)
							text += `<li><a href="${relaList[i].url}">${relaList[i].newstitle}</a></li>`;
						panel!.webview.html = panel!.webview.html.replace('<h2>相关文章</h2>', text + '</ul>');
					});
				}
				if (showComment) { // 显示网友评论
					panel!.webview.html += '<hr><h2>热门评论</h2><hr><h2>最' + commentOrderWord + '评论</h2>';
					superagent.get(`https://www.ithome.com/0/${Math.floor(id / 1000)}/${id % 1000}.htm`).end((err3, res3) => {
						let md5 = res3.text.substr(res3.text.indexOf('data=') + 6, 16);
						superagent.get('https://cmt.ithome.com/comment/' + md5).end((err4, res4) => {
							let newpagetype = res4.text.substr(res4.text.indexOf('newpagetype') + 15, 16);
							superagent.post('https://cmt.ithome.com/webapi/gethotcomment').send({ hash: newpagetype, pid: 1 }).set('Content-Type', 'application/x-www-form-urlencoded').end((err5, res5) => {
								let commentHTML = JSON.parse(res5.text).html;
								let level = commentHTML.match(RegExp('<span>Lv\\.\\d+?</span>', 'g'));
								let floor = commentHTML.match(RegExp('<strong class=\\"p_floor\\">.+?</strong>', 'g'));
								let nick = commentHTML.match(RegExp('<span class=\\"nick\\">[\\s\\S]+?</span>', 'g'));
								let posandtime = commentHTML.match(RegExp('<span class=\\"posandtime\\">.+?</span>', 'g'));
								let content = commentHTML.match(RegExp('<p>.+?</p>', 'g'));
								let agree = commentHTML.match(RegExp('支持\\(\\d+?\\)</a>', 'g'));
								let disagree = commentHTML.match(RegExp('反对\\(\\d+?\\)</a>', 'g'));
								let commentAppend = '<h2>热门评论</h2><ul>';
								for (let i in level)
									commentAppend += `<li style="margin:1em 0em"><strong style="font-size:1.2em">${nick[i].match(RegExp('>.+?</a>', 'g'))[0].slice(1, -4).replace(RegExp('src="//', 'g'), 'src="https://')}</strong><sup>${level[i].slice(6, -7)}</sup><div style="float:right">${floor[i]}@${posandtime[i]}</div>${content[i].replace('<p>', '<p style="margin:0px">').replace(RegExp('<img', 'g'), '<img style="height:1.3em"')}<span style="color:#28BD98;margin-right:3em">${agree[i].slice(0, -4)}</span><span style="color:#FF6F6F">${disagree[i].slice(0, -4)}</span></li>`;
								panel!.webview.html = panel!.webview.html.replace('<h2>热门评论</h2>', commentAppend + '</ul>');
							});
							superagent.post('https://cmt.ithome.com/webapi/getcomment').send({ hash: newpagetype, pid: 1, order: commentOrder }).set('Content-Type', 'application/x-www-form-urlencoded').end((err5, res5) => {
								let level = res5.text.match(RegExp('<span>Lv\\.\\d+?</span>', 'g'));
								let floor = res5.text.match(RegExp('<strong class=\\"p_floor\\">.+?</strong>', 'g'));
								let nick = res5.text.match(RegExp('<span class=\\"nick\\">[\\s\\S]+?</span>', 'g'));
								let posandtime = res5.text.match(RegExp('<span class=\\"posandtime\\">.+?</span>', 'g'));
								let content = res5.text.match(RegExp('<p>.+?</p>', 'g'));
								let agree = res5.text.match(RegExp('支持\\(\\d+?\\)</a>', 'g'));
								let disagree = res5.text.match(RegExp('反对\\(\\d+?\\)</a>', 'g'));
								let commentAppend = '<h2>最' + commentOrderWord + '评论</h2><ul>';
								let reply = false;
								for (let i in level) {
									if (floor[i].slice(-10, -9) == '#') {
										if (!reply)
											commentAppend = commentAppend.slice(0, -5) + '<ul>';
										reply = true;
									}
									else {
										if (reply)
											commentAppend += '</ul></li>';
										reply = false;
									}
									commentAppend += `<li style="margin:1em 0em"><strong style="font-size:1.2em">${nick[i].match(RegExp('>.+?</a>', 'g'))[0].slice(1, -4)}</strong><sup>${level[i].slice(6, -7)}</sup><div style="float:right">${floor[i]}@${posandtime[i]}</div>${content[i].replace('<p>', '<p style="margin:0px">').replace(RegExp('<img', 'g'), '<img style="height:1.3em"')}<span style="color:#28BD98;margin-right:3em">${agree[i].slice(0, -4)}</span><span style="color:#FF6F6F">${disagree[i]!.slice(0, -4)}</span></li>`;
								}
								panel!.webview.html = panel!.webview.html.replace('<h2>最' + commentOrderWord + '评论</h2>', commentAppend + (reply ? '</ul></li>' : '') + '</ul>');
							});
						});
					});
				}
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
		vscode.commands.registerCommand('ith2ome.latestRefresh', (refreshType: number) => { // 刷新“最新”
			refreshConfig();
			latest.refresh(refreshType);
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
