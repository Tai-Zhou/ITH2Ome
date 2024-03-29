import * as vscode from 'vscode';
import * as path from 'path';
import * as superagent from 'superagent';

let extensionPath: string; // 插件路径
let panel: vscode.WebviewPanel | undefined = undefined; // 查看内容窗口
let ithomeEmoji = ["爱你", "爱心", "挨揍", "暗中观察", "白鸡", "抱拳", "比心", "闭嘴", "不好惹的鸡", "不是吧", "不咋行", "不正经滑稽", "擦鼻血", "菜刀", "菜花", "超大的么么哒", "差强人意", "吃瓜", "吃惊", "呲牙笑", "大边框", "戴口罩", "大哭", "打脸", "大拇指", "弹出式摄像头", "蛋糕", "打你脸", "大眼卖萌", "对眼滑稽", "二哈", "烦", "非常惊讶", "愤怒", "佛系", "感兴趣", "给点吗", "狗头", "狗头不敢相信", "狗头斜眼", "害羞", "好的", "好的呀", "哈欠", "哈士奇", "嘿哈", "黑脸", "黑脸流汗", "红花", "坏笑", "滑稽", "滑稽鸡", "黄花", "惊讶", "囧", "拒绝", "考拉呆住", "可爱", "可爱滑稽", "酷", "苦脸", "骷髅", "苦中作乐", "蓝花", "老哥稳", "蜡烛", "流鼻血", "刘海屏", "流汗", "流汗滑稽", "路", "绿帽子", "马", "猫", "迷惑", "南", "南倒了", "念经", "你看我有在笑啊", "柠檬精", "你说啥", "牛", "哦吼", "胖次滑稽", "喷", "喷鼻血", "啤酒", "铺路", "强颜欢笑", "恰柠檬", "潜水", "庆祝", "拳头", "让我康康", "如花", "色", "胜利", "什么鬼", "手掌", "衰", "双挖孔屏", "水滴屏", "睡觉", "太阳", "摊手", "舔狗", "偷看", "吐", "托脸", "秃头", "兔子", "挖槽屏", "委屈", "委屈哭", "微笑", "握手", "我挺好的", "五瓣花", "捂脸笑哭", "相机", "小恶魔", "小黄鸡", "小鸡", "笑哭", "小拇指", "行吧行吧", "熊猫", "嘘", "药丸", "一本正经", "阴险笑", "幽灵", "右挖孔屏", "原谅他", "晕", "再见", "赞", "炸弹", "炸弹狂", "这个好这个好", "真服了", "猪", "专业团队", "左挖孔屏", "之家", "水库"]; // 之家表情包
let config: vscode.WorkspaceConfiguration; // 所有设置信息
let userHash: string; // 通行证 Cookie
let signReminder: boolean; // 签到提醒
let showPreviewImages: boolean; // 显示图片
let titleLength: number; // 显示图片
let imageWidth: number; // 显示图片宽度
let videoWidth: number; // 显示视频宽度
let showRelated: boolean; // 显示相关文章
let showComment: boolean; // 显示网友评论
let showAvatar: boolean; // 显示网友评论
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
	showPreviewImages = <boolean>config.get('showPreviewImages');
	titleLength = Math.max(<number>config.get('titleLength'), 0);
	imageWidth = <number>config.get('imageWidth');
	videoWidth = <number>config.get('videoWidth');
	showRelated = <boolean>config.get('showRelated');
	showComment = <boolean>config.get('showComment');
	showAvatar = <boolean>config.get('showAvatar');
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

function newsFormat(news: any, icon: string): ith2omeItem {
	let time = new Date(news.postdate).toLocaleString('zh-CN');
	let highlights = highlight(news.title);
	return {
		label: { highlights: highlights, label: news.title },
		contextValue: 'ith2ome.article',
		iconPath: new vscode.ThemeIcon(icon.length != 3 && highlights.length ? 'lightbulb' : icon),
		id: icon + news.newsid,
		description: time,
		resourceUri: linkCheck(news.url),
		tooltip: new vscode.MarkdownString(`**${news.title}**\n\n` + (showPreviewImages ? `![封面图](${news.image})` : '') + `\n\n*${time}*\n\n${news.description}\n\n点击数：${news.hitcount}｜评论数：${news.commentcount}`),
		command: { title: '查看内容', command: 'ith2ome.showContent', arguments: [news.title, news.newsid] },
		shareInfo: `标题：${news.title}\n时间：${time}\n内容：${news.description}\n点击数：${news.hitcount}｜评论数：${news.commentcount}\n`
	};
}

function titleFormat(title: string): string {
	return title.length > titleLength ? title.substring(0, titleLength) + '…' : title;
}

function linkFormat(text: string): string {
	let linkList = text.match(RegExp('<a href="https://www.ithome.com.*?</a>', 'g')); // 匹配之家文章链接
	for (let i in linkList) {
		let title = linkList[i].match(RegExp('(?<=>).*?(?=<)'))[0];
		let href = linkList[i].match(RegExp('(?<=href=").*?(?=")'))[0];
		let id = href.match(RegExp('(?<=0/).*?(?=\\.htm)'))[0].replace('/', '');
		text = text.replace(linkList[i], `<a href="" onclick="ITH2OmeOpen('${title}',${id});">${title}</a>`);
	}
	return text;
}

function numberFormat(num: number): string {
	return num >= 10000 ? (num / 10000).toFixed(1).toString() + '万' : num.toString();
}

interface userInfo {
	id: number, // ID
	level: number, // 等级
	link: string, // 主页
	m: number,
	userAvatar: string, // 头像
	userNick: string, // 昵称
	vip: number, // 管理员？
}

interface commentElementJSON {
	atUserId: number,
	content: string, // 内容
	height: number,
	isAutoReply: boolean,
	link: any,
	src: any,
	topicId: number,
	type: number,
	width: number,
}

interface commentJSON {
	against: number,
	checkStatus: number,
	children: commentJSON[], // 回复评论
	editRole: any,
	editStatus: number,
	editStatusStr: any,
	editTime: string,
	elements: commentElementJSON[],
	expandCount: number,
	floorStr: string, // 楼层
	id: number,
	paragraphId: any,
	parentCommentId: number,
	postTime: string, // 评论时间
	referTest: string, // 引文
	replyCommentId: number,
	replyFloorStr: string,
	replyUserInfo: userInfo,
	support: number,
	userInfo: userInfo, // 用户信息
	voteStatus: number,
}

function commentReplayFormt(comment: commentJSON) { // 生成回复
	return `回复 ${comment.replyFloorStr} <strong>${comment.replyUserInfo.userNick}</strong>：`
}

function commentItemFormat(comment: commentJSON): string { // 生成评论
	for (let i in ithomeEmoji)
		comment.elements[0].content = comment.elements[0].content.replace(RegExp('\\[' + ithomeEmoji[i] + '\\]', 'g'), '<img style="width:1.3em;vertical-align:text-bottom" src=\'' + panel!.webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'img', 'ithomEmoji', i + '.svg'))) + '\'>');
	return '<li style="margin:1em 0em">' + (showAvatar ? `<img style="float:left;height:4em;width:4em;border-radius:50%" src="${comment.userInfo.userAvatar}" onerror="this.src='${panel!.webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'img', 'noavatar.png')))}';this.onerror=null">` : '') + `<div style="margin-left:${showAvatar ? 5 : 0}em"><strong title="软媒通行证数字ID：${comment.userInfo.id}" style="font-size:1.2em">${comment.userInfo.userNick}</strong><sup>Lv.${comment.userInfo.level}</sup><div style="float:right">${comment.floorStr} @ ${new Date(comment.postTime).toLocaleString('zh-CN')}</div><br>${comment.replyFloorStr ? commentReplayFormt(comment) : ''}${linkFormat(comment.elements[0].content)}<br>${comment.children.length > 0 ? `<span style="margin-right:3em">回复(${comment.children.length})</span>` : ''}<span style="color:#28BD98;margin-right:3em">支持(${comment.support})</span><span style="color:#FF6F6F">反对(${comment.against})</span></div>`;
}

function commentFormat(commentList: commentJSON[], commentContent: string): string { // 评论JSON生成列表
	if (commentList.length == 0)
		return '';
	for (let comment of commentList) {
		commentContent += commentItemFormat(comment);
		if (comment.children.length > 0) {
			commentContent += '<ul>'
			for (let reply of comment.children)
				commentContent += commentItemFormat(reply) + '</li>';
			commentContent += '</ul>'
		}
		commentContent += '</li>'
	}
	return '<hr>' + commentContent + '</ul>';
}

class contentProvider implements vscode.TreeDataProvider<ith2omeItem> { // 为 View 提供内容
	update = new vscode.EventEmitter<void>(); // 用于触发刷新
	readonly onDidChangeTreeData = this.update.event;
	list: ith2omeItem[] = []; // 项目列表
	mode: number; // 工作模式，0 为“通行证”，1 为“最新”，2 为“热榜”，3 为“热评”
	refreshTimer: NodeJS.Timeout | undefined; // 自动刷新计时器

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
				if (lastReadId == 0 || refreshType == 0) // 仅在初始化和手动刷新时更新最后阅读标记
					lastReadId = latestNewsId;
				else if (lastReadId < 0) // lastReadId < 0 表示最后阅读标记已插入，刷新时需设为正
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
							this.list.push(newsFormat(newsList[i], newsList[i].aid ? 'tag' : (newsList[i].v == '100' ? 'device-camera-video' : 'preview')));
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
							this.list.push(newsFormat(newsList[i], newsList[i].url.search('lapin') != -1 ? 'tag' : (newsList[i].v == '100' ? 'device-camera-video' : 'preview')));
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
						command: { title: '查看内容', command: 'ith2ome.showContent', arguments: [commentList[i].News.NewsTitle, commentList[i].News.NewsId] },
						shareInfo: `${commentList[i].Comment.C}\n\n标题：${commentList[i].News.NewsTitle}\n时间：${time}\n用户：${user}\n`
					});
				}
				this.update.fire();
			});
			this.refreshTimer = setTimeout(() => { this.refresh(); }, 86400000); // 设置自动刷新时间
		}
	}
	getChildren(element?: ith2omeItem): vscode.TreeItem[] { // 获取项目列表
		if (element)
			return [];
		return this.list;
	}
	getTreeItem(element: ith2omeItem): vscode.TreeItem { // 获取项目
		return element;
	}
}

export function activate(context: vscode.ExtensionContext) {
	extensionPath = context.extensionPath;
	refreshConfig();
	period = <number>config.get('defaultPeriod'); // 仅在启动时从设置中读取
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
		vscode.commands.registerCommand('ith2ome.showContent', (title: string, id: number) => { // 显示新闻内容
			if (panel) { // 若标签页已存在
				panel.reveal(vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined);
				panel.title = titleFormat(title);
			}
			else { // 若标签页未开启或已关闭
				panel = vscode.window.createWebviewPanel('ith2ome', titleFormat(title), { preserveFocus: true, viewColumn: vscode.ViewColumn.One }, { enableScripts: true });
				panel.iconPath = vscode.Uri.file(path.join(extensionPath, 'img/icon.svg'));
				panel.webview.onDidReceiveMessage(
					message => {
						switch (message.command) {
							case 'relate':
								vscode.commands.executeCommand('ith2ome.showContent', message.title, message.id);
								return;
						}
					},
					undefined,
					context.subscriptions
				);
				panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
			}
			superagent.get('https://api.ithome.com/json/newscontent/' + id).end((errNews, resNews) => { // 获取新闻内容
				panel!.title = titleFormat(resNews.body.title);
				let BiliVideoList = resNews.body.detail.match(RegExp('<iframe class="ithome_video bilibili".*?</iframe>', 'g')); // 匹配B站视频
				for (let i in BiliVideoList) {
					let BVID = BiliVideoList[i].match(RegExp('(?<=bvid=)[0-9a-z]+', 'i'));
					if (BVID) {
						resNews.body.detail = resNews.body.detail.replace(BiliVideoList[i], '<div id="' + BVID + '" align="center"><h4><a href="https://www.bilibili.com/video/' + BVID + '">哔哩哔哩视频：信息加载中</a></h4></div>');
						superagent.get('https://api.bilibili.com/x/web-interface/view?bvid=' + BVID).end((errBiliVideo, resBiliVideo) => { // 加载B站视频信息
							let biliVideoData = resBiliVideo.body.data;
							panel!.webview.html = panel!.webview.html.replace(RegExp(`<div id="${BVID}.*?</div>`), '<div align="center" style="border:solid#FB7299"><h4><a href="https://www.bilibili.com/video/' + BVID + `">哔哩哔哩视频：${biliVideoData.title}</a></h4>` + (imageWidth > 0 ? `<img src="${biliVideoData.pic}" alt="哔哩哔哩视频封面">` : '') + `<table style="border-spacing:1.5em 0.5em"><tr><th>观看</th><th>弹幕</th><th>评论</th><th>点赞</th><th>投币</th><th>收藏</th><th>转发</th><th>发布时间</th></tr><tr><td>${numberFormat(biliVideoData.stat.view)}</td><td>${numberFormat(biliVideoData.stat.danmaku)}</td><td>${numberFormat(biliVideoData.stat.reply)}</td><td>${numberFormat(biliVideoData.stat.like)}</td><td>${numberFormat(biliVideoData.stat.coin)}</td><td>${numberFormat(biliVideoData.stat.favorite)}</td><td>${numberFormat(biliVideoData.stat.share)}</td><td>${new Date(biliVideoData.pubdate * 1000).toLocaleString('zh-CN')}</td></tr></table><table style="text-align:center;border-spacing:2em 0em;padding-bottom:1em"><tr>` + (imageWidth > 0 ? `<td style="min-width:6em"><img style="height:6em;width:6em;border-radius:50%" src="${biliVideoData.owner.face}"></br>` : '<td>') + `<strong><a href="https://space.bilibili.com/${biliVideoData.owner.mid}">${biliVideoData.owner.name}</a></strong></td><td><p style="white-space:pre-wrap;text-align:left">${biliVideoData.desc}</p></td></tr></table></div>`);
						});
					}
				}
				let weiboVideoList = resNews.body.detail.match(RegExp('<a class="ithome_super_player".*?</a>', 'g')); // 匹配微博视频
				for (let i in weiboVideoList) {
					let weiboHref = weiboVideoList[i].match(RegExp('(?<=href=").*?(?=")'))[0];
					if (weiboHref) {
						resNews.body.detail = resNews.body.detail.replace(weiboVideoList[i], `<div id="weiboVideo-${i}" align="center"><h4><a href="` + weiboHref + '">微博视频：信息加载中</a></h4></div>');
						superagent.get(weiboHref.replace('weibo.com', 'm.weibo.cn')).end((errWeiboVideo, resWeiboVideo) => { // 加载微博视频信息
							let weiboVideoData = JSON.parse(resWeiboVideo.text.match(RegExp('(?<=render_data = \\[)[\\s\\S]*?(?=\\]\\[0\\])'))![0]).status;
							panel!.webview.html = panel!.webview.html.replace(RegExp(`<div id="weiboVideo-${i}".*?</div>`), `<div align="center" style="border:solid#D13A34"><h4><a href="${weiboHref}">微博视频：${weiboVideoData.status_title}</a></h4>` + (videoWidth > 0 ? `<video controls="controls" style="max-width:100%;width:${videoWidth}px" poster="${weiboVideoData.page_info.page_pic.url}" src="${weiboVideoData.page_info.urls.mp4_720p_mp4}"></video>` : (imageWidth > 0 ? `<img src="${weiboVideoData.page_info.page_pic.url}" alt="微博视频封面">` : '')) + `<table style="border-spacing:1.5em 0.5em"><tr><th>观看</th><th>转发</th><th>评论</th><th>点赞</th><th>发布时间</th></tr><tr><td>${weiboVideoData.page_info.play_count}</td><td>${numberFormat(weiboVideoData.reposts_count)}</td><td>${numberFormat(weiboVideoData.comments_count)}</td><td>${numberFormat(weiboVideoData.attitudes_count)}</td><td>${new Date(weiboVideoData.created_at).toLocaleString('zh-CN')}</td></tr></table><table style="text-align:center;border-spacing:2em 0em;padding-bottom:1em"><tr>` + (imageWidth > 0 ? `<td style="min-width:6em"><img style="height:6em;width:6em;border-radius:50%" src="${weiboVideoData.user.profile_image_url}"></td><td colspan="3">` : '<td colspan="4">') + `<p style="white-space:pre-wrap;text-align:left">${weiboVideoData.text}</p></td></tr><tr><td><strong><a href="${weiboVideoData.user.profile_url}">${weiboVideoData.user.screen_name}</a></strong></td><td>${weiboVideoData.user.follow_count}关注</td><td>${weiboVideoData.user.followers_count}粉丝</td><td>${weiboVideoData.user.statuses_count}微博</td></tr></table></div>`);
							if (videoWidth > 0 || imageWidth > 0)
								superagent.get(weiboVideoData.page_info.page_pic.url).set('Referer', weiboHref).end((errWeiboVideoPic, resWeiboVideoPic) => {
									panel!.webview.html = panel!.webview.html.replace(weiboVideoData.page_info.page_pic.url, `data:${resWeiboVideoPic.type};base64,${Buffer.from(resWeiboVideoPic.body).toString('base64')}`);
								});// 加载微博视频封面
							if (imageWidth > 0)
								superagent.get(weiboVideoData.user.profile_image_url).set('Referer', weiboHref).end((errWeiboVideoAvatar, resWeiboVideoAvatar) => {
									panel!.webview.html = panel!.webview.html.replace(weiboVideoData.user.profile_image_url, `data:${resWeiboVideoAvatar.type};base64,${Buffer.from(resWeiboVideoAvatar.body).toString('base64')}`);
								});// 加载微博用户头像
						});
					}
				}
				let miaopaiVideoList = resNews.body.detail.match(RegExp('<iframe class="ithome_video" src="https://v\\.miaopai\\.com.*?</iframe>', 'g')); // 匹配秒拍视频
				for (let i in miaopaiVideoList) {
					let miaopaiHref = miaopaiVideoList[i].match(RegExp('(?<=src=").*?(?=")'))[0];
					let miaopaiScid = miaopaiHref.match(RegExp('(?<=scid=).*'))[0];
					if (miaopaiHref && miaopaiScid)
						resNews.body.detail = resNews.body.detail.replace(miaopaiVideoList[i], `<div align="center" style="border:solid#FCEA4F"><h4><a href="${miaopaiHref}">秒拍视频</a></h4>` + (videoWidth > 0 ? `<video controls="controls" style="max-width:100%;width:${videoWidth}px" poster="http://imgaliyuncdn.miaopai.com/stream/${miaopaiScid}_m.jpg" src="https://gslb.miaopai.com/stream/${miaopaiScid}.mp4"></video>` : '#视频已屏蔽#') + '</div>'); // 替换秒拍视频信息
				}
				resNews.body.detail = linkFormat(resNews.body.detail); // 匹配之家文章链接
				panel!.webview.html = '<head><style>' + (resNews.body.btheme ? 'body{filter:grayscale(100%)}' : '') + (imageWidth > 0 ? `img{width:${imageWidth}px}` : '') + `</style><script>const vscode=acquireVsCodeApi();function ITH2OmeOpen(title,id){vscode.postMessage({command:'relate',title,id});}</script></head><h1>${resNews.body.title}</h1><h3>新闻源：${resNews.body.newssource}（${resNews.body.newsauthor}）｜责编：${resNews.body.z}</h3><h4>${new Date(resNews.body.postdate).toLocaleString('zh-CN')}</h4><div style="position:sticky;top:0px"><button style="position:absolute;right:1rem;margin-top:90vh;" onclick="window.scrollTo({top:0,behavior:'smooth'});">回到顶部</button></div>${imageWidth <= 0 ? resNews.body.detail.replace(RegExp('<img[\\s\\S]*?>', 'g'), '#图片已屏蔽#') : resNews.body.detail}`;
				if (showRelated) { // 显示相关文章
					panel!.webview.html += `<hr><h2>相关文章</h2>`;
					superagent.get(`https://napi.ithome.com/api/news/getrelatednews/${id}`).end((errRelate, resRelate) => {
						let text = '<h2>相关文章</h2><ul>';
						let relateList = JSON.parse(resRelate.text).data.relatedNewsResponseModels;
						for (let relatedNews of relateList)
							text += `<li><a href="" onclick="ITH2OmeOpen('${relatedNews.newstitle}',${relatedNews.newsid});">${relatedNews.newstitle}</a></li>`;
						panel!.webview.html = panel!.webview.html.replace('<h2>相关文章</h2>', text + '</ul>');
					});
				}
				if (showComment) { // 显示网友评论
					panel!.webview.html += '<hr><h2>评论区加载中</h2>';
					superagent.get(`https://www.ithome.com/0/${Math.floor(id / 1000)}/${id % 1000}.htm`).end((errComment, resComment) => {
						let commentSN = resComment.text.match(RegExp('(?<=data-id=")[0-9a-f]{16}', 'g'));
						superagent.get(`https://cmt.ithome.com/api/webcomment/getnewscomment?sn=${commentSN}&isInit=true${commentOrder ? '&latest=1' : ''}`).end((errComment, resComment) => {
							let commentJSON = JSON.parse(resComment.text);
							panel!.webview.html = panel!.webview.html.replace('<hr><h2>评论区加载中</h2>', commentJSON && commentJSON.content.comments.length ? commentFormat(commentJSON.content.topComments, '<h2>置顶评论</h2><ul>') + commentFormat(commentJSON.content.hotComments, '<h2>热门评论</h2><ul>') + commentFormat(commentJSON.content.comments, '<h2>最' + commentOrderWord + '评论</h2><ul>') : '<hr><h2>暂无评论</h2>');
						});
					});
				}
			});
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
