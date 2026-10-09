import * as vscode from 'vscode';
import * as path from 'path';
import CryptoJS from 'crypto-js';

interface UserInfoJSON {
	id: number, // ID
	level: number, // 等级
	link: string, // 主页
	m: number,
	userAvatar: string, // 头像
	userNick: string, // 昵称
	vip: number, // 管理员？
}

interface CommentElementJSON {
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

interface CommentPictureJSON {
	alt: string | null, // 替代文本
	animation: boolean, // 是否为动画
	height: number, // 高度
	originSrc: string, // 原始图片链接
	src: string, // 图片链接
	thumbSrc: string, // 缩略图链接
	width: number // 宽度
}

interface DeviceTailJSON {
	client: number,
	color: string, // 颜色
	darkColor: string, // 深色模式颜色
	extraTails: DeviceTailJSON[], // 额外小尾巴
	link: string, // 之家产品百科链接
	name: string, // 名称
	origClient: number,
	origClientWithAppVersion: number,
	productId: number,
}

interface CommentJSON {
	against: number, // 反对
	aiHint: string, // AI 提示
	checkStatus: number,
	children: CommentJSON[] | null, // 回复评论
	city: string, // 城市
	deviceTailModel: DeviceTailJSON, // 设备小尾巴
	editRole: any,
	editStatus: number,
	editStatusStr: any,
	editTime: string,
	elements: CommentElementJSON[],
	expandCount: number, // 回复展开数
	floorStr: string, // 楼层
	id: number, // 评论id
	newsId: number, // 新闻 ID
	paragraphId: any,
	parentCommentId: number,
	pictures: CommentPictureJSON[], // 图片
	postTime: string, // 评论时间
	referText: string, // 引文
	replyCommentId: number, // 回复评论id
	replyFloorStr: string, // 回复楼层
	replyUserInfo: UserInfoJSON, // 回复用户信息
	support: number, // 支持
	tail: string, // 尾巴（客户端）
	tailClient: number,
	tailLink: null,
	userInfo: UserInfoJSON, // 用户信息
	voteStatus: number, // 投票状态，需要 Bearer token 才能获取
}

class Ith2omeItem extends vscode.TreeItem { // 在 TreeItem 基础上增加 shareInfo 用于复制链接、children 用于层级树
	shareInfo?: string;
	children?: Ith2omeItem[];
	topicSlug?: string; // 专题条目的 slug，展开时据此懒加载子文章
	topicPromise?: Promise<Ith2omeItem[]>; // 专题子文章的加载中的请求，同一节点复用
}

let extensionPath: string; // 插件路径
let extensionContext: vscode.ExtensionContext; // 插件上下文
let panel: vscode.WebviewPanel | undefined = undefined; // 查看内容窗口
let commentNewsId: string = ''; // 评论所属文章 newsid
let commentCid: number = 0; // 评论翻页游标：当前已显示的最后一条评论 id
let commentDone: boolean = false; // 评论是否已无更多
let commentLoading: boolean = false; // 评论是否正在加载
let contentSession: number = 0; // 查看内容会话令牌，切换内容时作废未返回的请求
const ITHOME_EMOJI = ["爱你", "爱心", "挨揍", "暗中观察", "白鸡", "抱拳", "比心", "闭嘴", "不好惹的鸡", "不是吧", "不咋行", "不正经滑稽", "擦鼻血", "菜刀", "菜花", "超大的么么哒", "差强人意", "吃瓜", "吃惊", "呲牙笑", "大边框", "戴口罩", "大哭", "打脸", "大拇指", "弹出式摄像头", "蛋糕", "打你脸", "大眼卖萌", "对眼滑稽", "二哈", "烦", "非常惊讶", "愤怒", "佛系", "感兴趣", "给点吗", "狗头", "狗头不敢相信", "狗头斜眼", "害羞", "好的", "好的呀", "哈欠", "哈士奇", "嘿哈", "黑脸", "黑脸流汗", "红花", "坏笑", "滑稽", "滑稽鸡", "黄花", "惊讶", "囧", "拒绝", "考拉呆住", "可爱", "可爱滑稽", "酷", "苦脸", "骷髅", "苦中作乐", "蓝花", "老哥稳", "蜡烛", "流鼻血", "刘海屏", "流汗", "流汗滑稽", "路", "绿帽子", "马", "猫", "迷惑", "南", "南倒了", "念经", "你看我有在笑啊", "柠檬精", "你说啥", "牛", "哦吼", "胖次滑稽", "喷", "喷鼻血", "啤酒", "铺路", "强颜欢笑", "恰柠檬", "潜水", "庆祝", "拳头", "让我康康", "如花", "色", "胜利", "什么鬼", "手掌", "衰", "双挖孔屏", "水滴屏", "睡觉", "太阳", "摊手", "舔狗", "偷看", "吐", "托脸", "秃头", "兔子", "挖槽屏", "委屈", "委屈哭", "微笑", "握手", "我挺好的", "五瓣花", "捂脸笑哭", "相机", "小恶魔", "小黄鸡", "小鸡", "笑哭", "小拇指", "行吧行吧", "熊猫", "嘘", "药丸", "一本正经", "阴险笑", "幽灵", "右挖孔屏", "原谅他", "晕", "再见", "赞", "炸弹", "炸弹狂", "这个好这个好", "真服了", "猪", "专业团队", "左挖孔屏", "之家", "水库", "六六六", "发抖", "感谢", "期待"]; // 之家表情包
let config: vscode.WorkspaceConfiguration; // 所有设置信息
let userHash: string = ''; // 通行证 Cookie
let userId: number = -1; // 用户 ID
let signReminder: boolean; // 签到提醒
let previewImageWidth: number; // 预览图片宽度
let titleLength: number; // 标题显示长度
let imageWidth: number; // 正文图片显示宽度
let imageScale: number; // 正文图片缩放比例
let imageScaleMethod: number; // 图片缩放触发方式
let imageScaleMethodWord: string; // 图片缩放触发方式关键字
let videoWidth: number; // 视频显示宽度
let showRelated: boolean; // 显示相关文章
let showComment: boolean; // 显示网友评论
let showAvatar: boolean; // 显示网友头像
let commentImageWidth: number; // 评论图片显示宽度
let commentImageScale: number; // 评论图片缩放比例
let commentOrder: boolean; // 网友评论顺序
let commentOrderWord: string; // 网友评论顺序字典
let blurNegativeComment: boolean; // 模糊负面评论
let commentBlockUsers: string[]; // 评论用户黑名单（软媒通行证数字 ID）
let autoRefresh: number; // “最新”刷新间隔
let keyWords: string[]; // 关键词列表
let keysLength: number[]; // 关键词长度
let keyWordsPush: boolean; // 自动刷新时提醒命中所设关键词的新文
let blockWords: string[]; // 屏蔽词列表
let period: number; // “热榜”榜单，仅在启动时从设置中读取
const PERIOD_DICT = ['48', 'weekhot', 'weekcomment', 'month']; // “热榜”榜单字典
const SEARCH_PAGE_SIZE = 20; // “搜索”每页条数
let showThumbs: boolean; // “热评”显示点赞数
let hideAd: boolean; // 文章列表隐藏广告
let hideAdTips: boolean; // 查看内容隐藏广告声明
let showUnread: boolean; // 侧边栏图标显示未读数
let latestNewsId: number = 0; // “最新”最新消息标记，用于显示上次阅读位置
let lastReadId: number = 0; // “最新”最后阅读标记，用于显示上次阅读位置
let latestTreeView: vscode.TreeView<Ith2omeItem>; // “最新”视图句柄，用于显示未读徽标
const LAST_READ: vscode.TreeItem = {
	label: '上次阅读到这里，点击刷新',
	iconPath: new vscode.ThemeIcon('refresh'),
	command: { title: '刷新', command: 'ith2ome.latestRefresh' }
};

async function getJSON(url: string, headers?: Record<string, string>): Promise<{ ok: boolean, body: any }> { // GET 请求并解析 JSON
	const res = await fetch(url, { headers: headers });
	return { ok: res.ok, body: await res.json().catch(() => undefined) };
}

async function getText(url: string): Promise<{ ok: boolean, text: string }> { // GET 请求并获取文本
	const res = await fetch(url);
	return { ok: res.ok, text: await res.text() };
}

async function refreshConfig() { // 刷新设置，仅在手动刷新时运行
	config = vscode.workspace.getConfiguration('ith2ome');
	userHash = await extensionContext.secrets.get('account') ?? '';
	signReminder = <boolean>config.get('signReminder');
	previewImageWidth = <number>config.get('previewImageWidth');
	titleLength = Math.max(<number>config.get('titleLength'), 0);
	imageWidth = <number>config.get('imageWidth');
	imageScale = <number>config.get('imageScale');
	imageScaleMethod = <number>config.get('imageScaleMethod');
	imageScaleMethodWord = imageScaleMethod == 1 ? 'active' : 'hover';
	videoWidth = <number>config.get('videoWidth');
	showRelated = <boolean>config.get('showRelated');
	showComment = <boolean>config.get('showComment');
	showAvatar = <boolean>config.get('showAvatar');
	commentImageWidth = <number>config.get('commentImageWidth');
	commentImageScale = <number>config.get('commentImageScale');
	commentOrder = <boolean>config.get('commentOrder');
	commentOrderWord = commentOrder ? '早' : '新';
	blurNegativeComment = <boolean>config.get('blurNegativeComment');
	commentBlockUsers = (<string[]>config.get('commentBlockUsers')).map(id => String(id).trim());
	autoRefresh = <number>config.get('autoRefresh');
	keyWords = <string[]>config.get('keyWords');
	keysLength = new Array(keyWords.length);
	for (const [i, word] of keyWords.entries())
		keysLength[i] = word.length;
	keyWordsPush = <boolean>config.get('keyWordsPush');
	blockWords = <string[]>config.get('blockWords');
	showThumbs = <boolean>config.get('showThumbs');
	hideAd = <boolean>config.get('hideAd');
	hideAdTips = <boolean>config.get('hideAdTips');
	showUnread = <boolean>config.get('unreadBadge');
}

function show(title: string, ad: boolean): boolean { // 返回是否显示该条新闻
	if (hideAd && ad)
		return false;
	for (let word of blockWords)
		if (title.search(RegExp(word, 'i')) != -1)
			return false;
	return true;
}

function highlight(title: string): [number, number][] { // 返回该条新闻关键词位置
	let highlights: [number, number][] = [];
	let loc: number;
	for (const [i, word] of keyWords.entries())
		if ((loc = title.search(RegExp(word, 'i'))) != -1)
			highlights.push([loc, loc + keysLength[i]]);
	return highlights;
}

function notifyNews(news: any): void { // 自动刷新时，对新出现且命中所设关键词的文章弹窗提醒
	vscode.window.showInformationMessage(news.title, '查看').then(choice => {
		if (choice == '查看')
			vscode.commands.executeCommand('ith2ome.showContent', news.title, String(news.newsid));
	});
}

function linkCheck(url: string): vscode.Uri { // 检查链接是否以 https:// 开始
	return vscode.Uri.parse(url.substring(0, 5) == 'https' ? url : 'https://www.ithome.com' + url);
}

function specialTopicSlug(url: string): string { // 检查链接是否为专题页并提取 slug
	let pos = url.indexOf('ithome.com/zt/');
	if (pos == -1)
		return '';
	let slug = url.substring(pos + 'ithome.com/zt/'.length);
	let end = slug.search(/[?#]/);
	return end == -1 ? slug : slug.substring(0, end);
}

function contentKey(news: any): string { // 内容唯一键：专题用 slug，文章用 newsid
	return specialTopicSlug(news.url) || String(news.newsid);
}

function eventUrl(link: string): string { // 事件详情页链接
	let id = link.match(RegExp('(?<=event\\?id=)\\d+'));
	return id ? 'https://img.ithome.com/app/calendar/event_detail.html?id=' + id[0] : '';
}

function searchUrl(keyword: string, maxNewsId: number): string { // 搜索接口地址
	return 'https://m.ithome.com/api/search/searchnewsget?keyWord=' + encodeURIComponent(keyword) + '&maxNewsId=' + maxNewsId + '&userhash=' + userHash;
}

function dateKey(date: Date): string { // 日期键：YYYY-MM-DD
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateKey(text: string): Date | undefined { // 解析 YYYYMMDD，或仅 MMDD（自动补当前年份）
	let match = text.trim().match(RegExp('^(\\d{4})?(\\d{2})(\\d{2})$'));
	if (!match)
		return undefined;
	let year = match[1] ? Number(match[1]) : new Date().getFullYear();
	let month = Number(match[2]);
	let day = Number(match[3]);
	let date = new Date(year, month - 1, day);
	return date.getFullYear() == year && date.getMonth() == month - 1 && date.getDate() == day ? date : undefined;
}

function eventDateFormat(value: string, options: Intl.DateTimeFormatOptions): string { // 事件日期格式化（日期部分按日历日）
	let [year, month, day] = value.substring(0, 10).split('-');
	return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('zh-CN', options);
}

function eventTimeFormat(value: string): string { // 事件时刻格式化（按系统时区）
	let date = new Date(value);
	return isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function newsFormat(news: any, icon: string): Ith2omeItem { // TreeItem 对象格式化
	let time = new Date(news.postdate).toLocaleString('zh-CN');
	let highlights = highlight(news.title);
	let id = contentKey(news);
	let counts = [news.hitcount == undefined ? '' : `点击数：${news.hitcount}`, news.commentcount == undefined ? '' : `评论数：${news.commentcount}`].filter(text => text).join('｜'); // 搜索结果没有评论数、专题子文章没有点击数
	let tooltip = new vscode.MarkdownString(`**${news.title}**\n\n` + (previewImageWidth > 0 ? `<img src="${news.image}" width="${previewImageWidth}">` : '') + `\n\n*${time}*\n\n${news.description}\n\n${counts}`);
	tooltip.supportHtml = true;
	return {
		label: { highlights: highlights, label: news.title },
		contextValue: 'ith2ome.article',
		iconPath: new vscode.ThemeIcon(icon.length != 3 && highlights.length ? 'lightbulb' : icon),
		id: icon + id,
		description: time,
		resourceUri: linkCheck(news.url),
		tooltip,
		command: specialTopicSlug(news.url) ? undefined : { title: '查看内容', command: 'ith2ome.showContent', arguments: [news.title, id] }, // 专题不再支持打开页面
		shareInfo: `标题：${news.title}\n时间：${time}\n内容：${news.description}\n${counts}\n`
	};
}

function titleFormat(title: string): string { // Tab 标题格式化
	return title.length > titleLength ? title.substring(0, titleLength) + '…' : title;
}

function linkFormat(text: string): string { // 之家文章链接格式化
	let linkList = text.match(RegExp('<a[^>]*href=["\']https://www\\.ithome\\.com[^"\']*["\'][^>]*>[\\s\\S]*?</a>', 'g')) ?? []; // 匹配之家文章链接
	for (let link of linkList) {
		let title = link.match(RegExp('(?<=>).*?(?=<)'))![0];
		let href = link.match(RegExp('href=["\']([^"\']*)["\']'))![1];
		let slug = specialTopicSlug(href);
		let article = slug ? null : href.match(RegExp('ithome\\.com/(\\d+)/(\\d+)/(\\d+)\\.htm'));
		if (slug || !article) // 专题链接与其它非文章链接不改写，保持原链接由浏览器打开
			continue;
		let id = String(Number(article.slice(1).join('')));
		text = text.replace(link, `<a href="" onclick="ITH2OmeOpen('${title}','${id}');">${title}</a>`);
	}
	return text;
}

function topicNewsList(html: string): any[] { // 解析专题页里的子文章，页面顺序即最新在前，最多 50 篇
	let list = html.match(RegExp('<ol class="newslist[\\s\\S]*?</ol>'));
	if (!list)
		return [];
	let newsList: any[] = [];
	for (let item of list[0].match(RegExp('<li>[\\s\\S]*?</li>', 'g')) ?? []) {
		let time = item.match(RegExp("(?<=jsDateDiff\\(')[^']*"));
		let href = item.match(RegExp('ithome\\.com/(\\d+)/(\\d+)/(\\d+)\\.htm'));
		let title = item.match(RegExp('(?<=<h2>)[\\s\\S]*?(?=</h2>)'));
		if (!time || !href || !title)
			continue;
		let comment = item.match(RegExp('(?<=<div class="comment">)\\d+'));
		newsList.push({
			newsid: Number(href.slice(1).join('')),
			url: 'https://' + href[0],
			title: title[0].trim(),
			description: item.match(RegExp('(?<=<p class="hidden-xs">)[\\s\\S]*?(?=</p>)'))?.[0] ?? '',
			postdate: new Date(time[0]).toISOString(),
			image: item.match(RegExp('(?<=data-original=")[^"]*'))?.[0],
			commentcount: comment == undefined ? undefined : Number(comment[0])
		});
	}
	return newsList;
}

function numberFormat(num: number): string { // 中文数字显示格式化
	return num >= 10000 ? (num / 10000).toFixed(1).toString() + '万' : num.toString();
}

function commentUserNickNameFormat(userInfo: UserInfoJSON) {
	if (userInfo.m == 9)
		return `<span style="color:#3264b4">${userInfo.userNick}</span>`;
	else if (userInfo.m == 1)
		return `<span style="color:#3264b4">${userInfo.userNick}</span>`;
	return userInfo.userNick;
}

function commentDeviceTailFormat(deviceTail: DeviceTailJSON) {
	if (!deviceTail)
		return '';
	let content = `｜<span style="color:${deviceTail.darkColor}">${deviceTail.name}</span>`;
	if (deviceTail.extraTails)
		for (let extraDevice of deviceTail.extraTails)
			content += `｜<span style="color:${extraDevice.darkColor}">${extraDevice.name}</span>`;
	return content;
}

function commentReplyFormat(comment: CommentJSON) { // 生成回复
	return `回复 ${comment.replyFloorStr} <strong>${comment.replyUserInfo.userNick}</strong>：`
}

function commentPictureFormat(pictures: CommentPictureJSON[]) { // 生成评论图片
	if (!pictures)
		return '';
	let content = '<div style="text-align:center">';
	for (let picture of pictures)
		if (commentImageWidth > 0)
			content += `<img class="comment" src="${picture.src}"` + (imageScaleMethod == 2 ? ' onclick="this.classList.toggle(\'img-comment-zoom\')"/>' : '/>')
		else
			content += '#图片已屏蔽#'
	return content + '</div>'
}

function commentVoteFormat(commentId: number, reply: number, support: number, against: number, voteStatus: number) { // 生成评论投票
	let supportId = 1, againstId = 2;
	let supportClass = "", againstClass = "";
	if (voteStatus == 1) { // 已支持
		supportId = -1;
		againstId = 0;
		supportClass = "voted ";
	} else if (voteStatus == 2) { // 已反对
		supportId = 0;
		againstId = -2;
		againstClass = "voted ";
	}
	return `<span style="margin-right:3em">回复(${reply})</span><a class="${supportClass}support" onclick="voteCommentWebview(${commentId},${supportId},${reply},${support},${against})">支持(${support})</a><a class="${againstClass}against" onclick="voteCommentWebview(${commentId},${againstId},${reply},${support},${against})">反对(${against})</a>`;
}

function commentItemFormat(comment: CommentJSON, idPrefix: string): string { // 生成评论
	let content = ""
	for (let element of comment.elements)
		content += element.content;
	content = content.replaceAll("\n", "<br>");
	for (const [i, emoji] of ITHOME_EMOJI.entries())
		content = content.replace(RegExp('\\[' + emoji + '\\]', 'g'), '<img style="width:1.3em;vertical-align:text-bottom" src=\'' + panel!.webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'img', 'ithomEmoji', i + '.svg'))) + '\'>');
	let commentClass = ""; // 多反对评论：只模糊正文
	let commentItemClass = ""; // 黑名单用户：整条评论模糊（包裹头像与信息块）
	if (commentBlockUsers.includes(String(comment.userInfo.id)))
		commentItemClass = "blur";
	else if (blurNegativeComment && comment.support < comment.against)
		commentClass = "blur";
	return '<li style="margin:1em 0em">' + `<div class="${commentItemClass}">` + (showAvatar ? `<img class="avatar" src="${comment.userInfo.userAvatar}" onerror="this.src='${panel!.webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'img', 'noavatar.png')))}';this.onerror=null">` : '') + `<div style="margin-left:${showAvatar ? 5 : 0}em"><strong title="软媒通行证数字ID：${comment.userInfo.id}" style="font-size:1.2em">${commentUserNickNameFormat(comment.userInfo)}</strong> <sup>Lv.${comment.userInfo.level}｜${comment.city}${commentDeviceTailFormat(comment.deviceTailModel)}${comment.aiHint ? '｜' + comment.aiHint : ''}</sup><div style="float:right">${comment.floorStr} @ ${new Date(comment.postTime).toLocaleString('zh-CN')}</div>${comment.referText ? '<blockquote>' + comment.referText + '</blockquote>' : '<br>'}<div class="${commentClass}">${comment.replyFloorStr ? commentReplyFormat(comment) : ''}${linkFormat(content)}${commentPictureFormat(comment.pictures)}</div><div id="vote-${idPrefix}${comment.id}">${commentVoteFormat(comment.id, comment.children ? comment.children.length : 0, comment.support, comment.against, comment.voteStatus)}</div></div></div>`; // 行末三个闭合标签依次收尾投票、信息块、模糊包裹层，少一个回复列表就会落进模糊层；回复列表由 commentListFormat 追加在包裹层之后
}

function commentListFormat(commentList: CommentJSON[], idPrefix: string): string { // 生成一组评论（不含外层列表）
	let content = '';
	for (let comment of commentList) {
		content += commentItemFormat(comment, idPrefix);
		if (comment.children) {
			content += '<ul>'
			for (let reply of comment.children)
				content += commentItemFormat(reply, idPrefix) + '</li>';
			content += '</ul>'
		}
		content += '</li>'
	}
	return content;
}

function commentFormat(commentList: CommentJSON[], commentTitle: string, more: boolean = false): string { // 评论JSON生成列表
	if (commentList.length == 0)
		return '';
	let idPrefix = '';
	if (commentTitle == '置顶评论')
		idPrefix = 'top-';
	else if (commentTitle == '热门评论')
		idPrefix = 'hot-';
	let commentContent = `<h2>${commentTitle}</h2><ul>` + commentListFormat(commentList, idPrefix);
	if (more) // 列表末尾的“加载更多评论”链接，进入视口时自动触发
		commentContent += '<li id="commentmore"><a style="text-decoration:underline;cursor:pointer" onclick="loadMoreComments()">加载更多评论 ...</a></li>';
	return '<hr>' + commentContent + '</ul>';
}

function commentSn(newsId: string): string { // 评论接口的文章 sn（newsid 经 DES 加密）
	return CryptoJS.DES.encrypt(CryptoJS.enc.Utf8.parse(newsId),
		CryptoJS.enc.Utf8.parse('(#i@x*l%'), {
		mode: CryptoJS.mode.ECB,
		padding: CryptoJS.pad.ZeroPadding
	}).ciphertext.toString();
}

function loadComments(panel: vscode.WebviewPanel, id: string, session: number, initial: boolean) { // 加载评论，initial 为首次加载，否则为翻页
	if (initial) { // 首次加载时重置翻页状态
		commentNewsId = id;
		commentCid = 0;
		commentDone = false;
		commentLoading = false; // 作废上一篇文章未返回的请求
	}
	if (commentLoading || commentDone)
		return;
	commentLoading = true;
	getJSON(`https://cmt.ithome.com/apiv2/comment/getnewscomment?sn=${commentSn(commentNewsId)}${commentOrder ? '&latest=1' : ''}${commentCid ? '&cid=' + commentCid : ''}`).then(resComment => {
		if (session != contentSession) // 已切换到其它内容，丢弃本次结果
			return;
		commentLoading = false;
		let content = resComment.body ? resComment.body.content : undefined;
		if (!content) { // 加载失败：首次提示重试，翻页恢复链接
			if (initial)
				panel.webview.html = panel.webview.html.replace('<hr><h2>评论区加载中</h2>', '<hr><h2>评论加载失败，请刷新重试</h2>');
			else
				panel.webview.postMessage({ command: 'commentsError' });
			return;
		}
		let topComments: CommentJSON[] = content.topComments ?? [];
		let hotComments: CommentJSON[] = content.hotComments ?? [];
		let comments: CommentJSON[] = content.comments ?? [];
		if (initial)
			panel.webview.html = panel.webview.html.replace('<hr><h2>评论区加载中</h2>', topComments.length + hotComments.length + comments.length > 0
				? commentFormat(topComments, '置顶评论') + commentFormat(hotComments, '热门评论') + commentFormat(comments, '最' + commentOrderWord + '评论', true)
				: '<hr><h2>暂无评论</h2>');
		else if (comments.length == 0) { // 翻页取不到新评论即到底
			commentDone = true;
			panel.webview.postMessage({ command: 'commentsDone' });
		}
		else // 追加本页评论
			panel.webview.postMessage({ command: 'appendComments', text: commentListFormat(comments, '') });
		if (comments.length > 0) // 翻页游标取本页最后一条评论 id
			commentCid = comments[comments.length - 1].id;
	});
}

function gradeFormat(articleId: number, voteGrade: number, grade: number, support: number, against: number): string { // 生成文章得分和投票按钮
	if (voteGrade == 2) // 有价值
		return `<p id="grade">文章价值：<strong>${grade}</strong> 分， ${support + against} 人打分</p><a class="voted support" onclick="voteArticleWebview(${articleId},-1,${support - 1},${against})">有价值(${support})</a><a class="against" onclick="voteArticleWebview(-1,0,${support - 1},${against})">无价值(${against})</a>`;
	if (voteGrade == 0) // 无价值
		return `<p id="grade">文章价值：<strong>${grade}</strong> 分， ${support + against} 人打分</p><a class="support" onclick="voteArticleWebview(-1,2,${support},${against - 1})">有价值(${support})</a><a class="voted against" onclick="voteArticleWebview(${articleId},-3,${support},${against - 1})">无价值(${against})</a>`;
	// 未投票
	return `<p id="grade">打分后显示文章质量得分，当前 ${support + against} 人打分</p><a class="support" onclick="voteArticleWebview(${articleId},2,${support},${against})">有价值</a><a class="against" onclick="voteArticleWebview(${articleId},0,${support},${against})">无价值</a>`
}

function voteArticle(panel: vscode.WebviewPanel, articleId: number, voteType: string, voteGrade: number, support: number, against: number) { // 文章投票
	if (userId == -1) // 未登录
		return vscode.window.showErrorMessage("请先登录之家账号！");
	// 因为要改 origin，所以不能在 webview 里请求，要转发至 vscode，再用 fetch 请求后转发回 webview
	getJSON(`https://dyn.ithome.com/api/newsgrade/${voteType}?user=${userHash}&newsid=${articleId}&grade=${voteGrade}`, { Origin: "https://www.ithome.com" }).then(resGrade => {
		if (!resGrade.ok)
			return vscode.window.showErrorMessage("打分失败，请检查账号和网络！");
		if (voteType != "create") // 取消投票
			voteGrade = 1;
		else { // 刷新投票人数数据
			support = resGrade.body.g3;
			against = resGrade.body.g1;
		}
		panel.webview.postMessage({
			command: 'refreshGrade', text: gradeFormat(articleId, voteGrade, resGrade.body.Grade, support, against)
		});
	});
}


function voteComment(panel: vscode.WebviewPanel, commentId: number, voteType: string, typeId: number, reply: number, support: number, against: number) { // 评论投票
	if (userId == -1) // 未登录
		return vscode.window.showErrorMessage("请先登录之家账号！");
	// 因为要改 origin，所以不能在 webview 里请求，要转发至 vscode，再用 fetch 请求后转发回 webview
	getJSON(`https://cmt.ithome.com/api/comment/${voteType}?commentId=${commentId}&typeId=${typeId}&userhash=${userHash}`, { Origin: "https://www.ithome.com" }).then(resVote => {
		if (!resVote.ok)
			return vscode.window.showErrorMessage("投票失败，请检查账号和网络！");
		if (!resVote.body.success) { // 已投票，但插件没有投票信息，本处刷新信息
			vscode.window.showErrorMessage(`投票失败，${resVote.body.message}！`);
			typeId = resVote.body.message.includes("支持") ? 1 : 2;
		} else if (voteType != "vote") { // 取消投票
			if (typeId == 1)
				--support;
			else
				--against;
			typeId = -1;
		} else if (typeId == 1) // 支持
			++support;
		else // 反对
			++against;
		panel.webview.postMessage({
			command: 'refreshVote', id: commentId, text: commentVoteFormat(commentId, reply, support, against, typeId)
		});
	});
}


class AccountProvider implements vscode.TreeDataProvider<Ith2omeItem> { // 通行证
	update = new vscode.EventEmitter<void>(); // 用于触发刷新
	readonly onDidChangeTreeData = this.update.event;
	list: Ith2omeItem[] = []; // 项目列表
	refreshTimer: NodeJS.Timeout | undefined; // 自动刷新计时器

	constructor() {
		this.refresh();
	}
	refresh() {
		if (this.refreshTimer)
			clearTimeout(this.refreshTimer); // 清除下一次自动刷新计时器
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
			getJSON(`https://my.ruanmei.com/api/User/Get?userHash=${userHash}&extra`).then(async res => {
				if (!res.body.ok) { // 失败
					userHash = '';
					await extensionContext.secrets.delete('account');
					vscode.window.showErrorMessage('登录失败，请检查 Cookie！');
					this.refresh();
					return;
				}
				let userInfo = res.body.userinfo;
				userId = userInfo.userid;
				this.list = [{
					label: `${userInfo.nickname}，您好！您已连续登录 ${userInfo.conldays} 天`,
					iconPath: new vscode.ThemeIcon('account'),
					contextValue: 'ith2ome.account'
				}, {
					label: `目前等级 ${userInfo.rank}，经验值 ${userInfo.exp}，需 ${userInfo.remainexp} 经验升级`,
					iconPath: new vscode.ThemeIcon('star-empty')
				}];
				this.update.fire();
				getJSON('https://my.ruanmei.com/api/usersign/getsigninfo?userHash=' + userHash).then(res2 => {
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
	getChildren(element?: Ith2omeItem): vscode.TreeItem[] { // 获取项目列表
		if (element)
			return [];
		return this.list;
	}
	getTreeItem(element: Ith2omeItem): vscode.TreeItem { // 获取项目
		return element;
	}
}

interface SearchItem extends Ith2omeItem { // 搜索父节点，携带该次搜索的翻页与去重状态
	keyword: string; // 关键词
	maxNewsId: number; // 翻页游标：已显示的最后一篇 newsid
	idSet: Set<string>; // 该次搜索已显示的内容键集合
}

class SearchProvider implements vscode.TreeDataProvider<Ith2omeItem> { // 搜索
	update = new vscode.EventEmitter<void>(); // 用于触发刷新
	readonly onDidChangeTreeData = this.update.event;
	list: SearchItem[] = []; // 搜索父节点列表，最新搜索在最前

	search(keyword: string) { // 新建一次搜索，结果作为该节点的子项
		if (userHash == '') {
			vscode.window.showErrorMessage('请先登录通行证后再搜索！');
			return;
		}
		getJSON(searchUrl(keyword, 0)).then(res => {
			if (res.body.Result == 'needLogin') {
				vscode.window.showErrorMessage('搜索登录失败，请检查 Cookie！');
				return;
			}
			let newsList = res.body.Success == 1 && Array.isArray(res.body.Result) ? res.body.Result : [];
			let node: SearchItem = {
				label: keyword,
				contextValue: 'ith2ome.search',
				description: eventTimeFormat(new Date().toISOString()),
				id: 'search' + Date.now(),
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
				children: [],
				keyword: keyword,
				maxNewsId: 0,
				idSet: new Set<string>()
			};
			let count = this.appendNews(node, newsList);
			if (count == 0) // 无结果
				node.children!.push({ label: '没有找到相关内容', iconPath: new vscode.ThemeIcon('info') });
			else if (newsList.length == SEARCH_PAGE_SIZE) // 整页返回时才可能还有下一页
				node.children!.push(this.loadMoreItem(node));
			this.list.unshift(node); // 最新搜索在最前，相当于时间倒序
			this.update.fire();
		});
	}
	loadMore(node: SearchItem) { // 加载该次搜索的更多结果
		node.children!.pop(); // 移除“加载更多数据”
		getJSON(searchUrl(node.keyword, node.maxNewsId)).then(res => {
			let newsList = res.body.Success == 1 && Array.isArray(res.body.Result) ? res.body.Result : [];
			if (this.appendNews(node, newsList) > 0 && newsList.length == SEARCH_PAGE_SIZE) // 仍有新内容且是整页
				node.children!.push(this.loadMoreItem(node));
			this.update.fire();
		});
	}
	delete(node: Ith2omeItem) { // 删除单次搜索
		this.list = this.list.filter(item => item != node);
		this.update.fire();
	}
	clear() { // 清空全部搜索
		this.list = [];
		this.update.fire();
	}
	appendNews(node: SearchItem, newsList: any[]): number { // 追加搜索结果，返回新增条数
		let count = 0;
		for (let news of newsList) {
			if (hideAd && String(news.url).search('lapin') != -1) // 搜索不套用屏蔽词，只隐藏广告
				continue;
			let key = contentKey(news);
			if (node.idSet.has(key)) // 同一次搜索内去重
				continue;
			node.idSet.add(key);
			let item = newsFormat(news, 'search');
			item.id = node.id + '-' + item.id; // TreeItem.id 需在整棵树内唯一
			node.children!.push(item);
			count++;
		}
		if (newsList.length > 0) // 翻页游标取本页最后一条，与过滤结果无关
			node.maxNewsId = newsList[newsList.length - 1].newsid;
		return count;
	}
	loadMoreItem(node: SearchItem): Ith2omeItem { // “加载更多数据”子项
		return {
			label: '加载更多数据',
			iconPath: new vscode.ThemeIcon('eye'),
			command: { title: '加载更多数据', command: 'ith2ome.searchMore', arguments: [node] }
		};
	}
	getChildren(element?: Ith2omeItem): vscode.TreeItem[] { // 获取项目列表
		if (element)
			return element.children ?? [];
		return this.list;
	}
	getTreeItem(element: Ith2omeItem): vscode.TreeItem { // 获取项目
		return element;
	}
}

class LatestProvider implements vscode.TreeDataProvider<Ith2omeItem> { // 最新
	update = new vscode.EventEmitter<Ith2omeItem | undefined | null | void>(); // 用于触发刷新，传入条目时只刷新该条目
	readonly onDidChangeTreeData = this.update.event;
	list: Ith2omeItem[] = []; // 项目列表
	idSet: Set<string> = new Set(); // 文章 ID 集合
	notifyKeys: Set<string> = new Set(); // 上次首屏刷新时的内容键，用于判定本次新出现的条目
	notifyReady: boolean = false; // 首次刷新只记基线，不提醒
	readOrder: number = 0; // 上次手动刷新时首屏最新的 orderdate，用于统计未读数
	refreshTimer: NodeJS.Timeout | undefined; // 自动刷新计时器

	constructor() {
		this.refresh();
	}
	refresh(refreshType: number = 0) { // 0 为手动刷新，1 为自动刷新，其余为加载更多的时间戳
		if (this.refreshTimer)
			clearTimeout(this.refreshTimer); // 清除下一次自动刷新计时器
		if (refreshType < 2) {
			this.list = []; // 清除项目列表
			this.idSet.clear();
			if (lastReadId == 0 || refreshType == 0) // 仅在初始化和手动刷新时更新最后阅读标记
				lastReadId = latestNewsId;
			else if (lastReadId < 0) // lastReadId < 0 表示最后阅读标记已插入，刷新时需设为正
				lastReadId = -lastReadId;
			getJSON('https://api.ithome.com/json/newslist/news').then(res => {
				let unreadCount = 0; // 上次手动刷新之后新出现的条目数
				let newestOrder = 0; // 本次首屏最新的 orderdate
				let topList = res.body.toplist;
				for (let top of topList)
					if (show(top.title, false) && !this.idSet.has(contentKey(top))) {
						this.idSet.add(contentKey(top));
						this.list.push(this.itemFormat(top, 'pinned'));
						let orderTime = new Date(top.orderdate).getTime() || 0;
						newestOrder = Math.max(newestOrder, orderTime);
						if (refreshType != 0 && orderTime > this.readOrder)
							unreadCount++;
					}
				let newsList = res.body.newslist;
				let keys = new Set<string>(); // 本次首屏刷新的内容键
				for (const [i, news] of newsList.entries()) {
					let orderTime = new Date(news.orderdate).getTime();
					newestOrder = Math.max(newestOrder, orderTime);
					latestNewsId = Math.max(latestNewsId, orderTime);
					if (orderTime <= lastReadId) {
						if (i != 0)
							this.list.push(LAST_READ);
						lastReadId = -lastReadId;
					}
					keys.add(contentKey(news));
					if (show(news.title, news.aid) && !this.idSet.has(contentKey(news))) {
						this.idSet.add(contentKey(news));
						this.list.push(this.itemFormat(news, news.aid ? 'tag' : (news.v == '100' ? 'device-camera-video' : 'preview')));
						if (refreshType == 1 && keyWordsPush && this.notifyReady && !this.notifyKeys.has(contentKey(news)) && highlight(news.title).length > 0) // 仅自动刷新时提醒新出现且命中关键词的条目
							notifyNews(news);
						if (refreshType != 0 && orderTime > this.readOrder)
							unreadCount++;
					}
				}
				this.notifyKeys = keys;
				this.notifyReady = true;
				if (refreshType == 0) // 手动刷新（含激活时首次加载）视为已读
					this.readOrder = Math.max(this.readOrder, newestOrder);
				updateUnreadBadge(unreadCount);
				this.list.push({
					label: '加载更多数据',
					iconPath: new vscode.ThemeIcon('eye'),
					command: { title: '加载更多数据', command: 'ith2ome.latestRefresh', arguments: [new Date(newsList[newsList.length - 1].orderdate).getTime()] }
				});
				this.update.fire();
			});
		} else { // 加载更多数据
			this.list.pop();
			getJSON('https://m.ithome.com/api/news/newslistpageget?ot=' + refreshType).then(res => {
				let newsList = res.body.Result;
				for (let news of newsList) {
					if (lastReadId > 0 && new Date(news.orderdate).getTime() <= lastReadId) {
						this.list.push(LAST_READ);
						lastReadId = -lastReadId;
					}
					if (show(news.title, news.url.search('lapin') != -1) && !this.idSet.has(contentKey(news))) {
						this.idSet.add(contentKey(news));
						this.list.push(this.itemFormat(news, news.url.search('lapin') != -1 ? 'tag' : (news.v == '100' ? 'device-camera-video' : 'preview')));
					}
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
			this.refreshTimer = setTimeout(() => { // 自动刷新前重读设置
				refreshConfig().then(() => this.refresh(1), () => this.refresh(1));
			}, autoRefresh * 1000); // 设置自动刷新时间
	}
	itemFormat(news: any, icon: string): Ith2omeItem { // 专题条目作为可展开父节点，不再点击打开页面，但仍保留复制与浏览器按钮
		let item = newsFormat(news, icon);
		let slug = specialTopicSlug(news.url);
		if (slug) {
			item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
			item.topicSlug = slug;
		}
		return item;
	}
	topicChildren(element: Ith2omeItem): Promise<Ith2omeItem[]> { // 展开专题时懒加载子文章，同一节点复用同一请求
		if (!element.topicPromise)
			element.topicPromise = getText('https://www.ithome.com/zt/' + element.topicSlug).then(res => {
				if (!res.ok) { // 失败不缓存，展开或点击重试时会重新拉取
					element.topicPromise = undefined;
					return [{
						label: '专题加载失败，点击重试',
						iconPath: new vscode.ThemeIcon('refresh'),
						command: { title: '重试', command: 'ith2ome.loadTopic', arguments: [element] }
					}];
				}
				let children: Ith2omeItem[] = []; // 子文章套用屏蔽词，专题页列表本身没有广告
				let idSet = new Set<string>();
				for (let news of topicNewsList(res.text))
					if (show(news.title, false) && !idSet.has(String(news.newsid))) {
						idSet.add(String(news.newsid));
						let item = newsFormat(news, 'preview');
						item.id = String(element.id) + '-' + item.id; // TreeItem.id 需在整棵树内唯一
						children.push(item);
					}
				if (children.length == 0)
					children.push({ label: '专题暂无文章', iconPath: new vscode.ThemeIcon('info') });
				element.children = children;
				return children;
			});
		return element.topicPromise;
	}
	getChildren(element?: Ith2omeItem): vscode.ProviderResult<Ith2omeItem[]> { // 获取项目列表
		if (element) {
			if (element.children) // 已加载
				return element.children;
			if (element.topicSlug) // 专题子文章，展开时才拉取
				return this.topicChildren(element);
			return [];
		}
		return this.list;
	}
	getTreeItem(element: Ith2omeItem): vscode.TreeItem { // 获取项目
		return element;
	}
}


class HotProvider implements vscode.TreeDataProvider<Ith2omeItem> { // 热榜
	update = new vscode.EventEmitter<void>(); // 用于触发刷新
	readonly onDidChangeTreeData = this.update.event;
	list: Ith2omeItem[] = []; // 项目列表
	refreshTimer: NodeJS.Timeout | undefined; // 自动刷新计时器

	constructor() {
		this.refresh();
	}
	refresh() {
		if (this.refreshTimer)
			clearTimeout(this.refreshTimer); // 清除下一次自动刷新计时器
		this.list = []; // 清除项目列表
		getJSON('https://api.ithome.com/json/newslist/rank').then(res => {
			let rankList = res.body['channel' + PERIOD_DICT[period] + 'rank'];
			for (let rank of rankList)
				this.list.push(newsFormat(rank, 'flame'));
			this.update.fire();
		});
		this.refreshTimer = setTimeout(() => { this.refresh(); }, 86400000); // 设置自动刷新时间
	}
	getChildren(element?: Ith2omeItem): vscode.TreeItem[] { // 获取项目列表
		if (element)
			return [];
		return this.list;
	}
	getTreeItem(element: Ith2omeItem): vscode.TreeItem { // 获取项目
		return element;
	}
}

class CommentProvider implements vscode.TreeDataProvider<Ith2omeItem> { // 热评
	update = new vscode.EventEmitter<void>(); // 用于触发刷新
	readonly onDidChangeTreeData = this.update.event;
	list: Ith2omeItem[] = []; // 项目列表
	refreshTimer: NodeJS.Timeout | undefined; // 自动刷新计时器

	constructor() {
		this.refresh();
	}
	refresh() {
		if (this.refreshTimer)
			clearTimeout(this.refreshTimer); // 清除下一次自动刷新计时器
		this.list = []; // 清除项目列表
		getJSON('https://cmt.ithome.com/api/comment/hotcommentlist/').then(res => {
			let commentList = res.body.content.commentlist;
			for (let comment of commentList) {
				let time = new Date(comment.Comment.T).toLocaleString('zh-CN');
				let locLength = comment.Comment.Y.length;
				let user = comment.Comment.N + (locLength > 6 ? ` @ ${comment.Comment.Y.substring(4, locLength - 2)}` : '');
				this.list.push({
					label: (showThumbs ? `${comment.Comment.S} | ` : '') + comment.Comment.C.replace(RegExp('[\n]+', 'g'), ' '),
					contextValue: 'ith2ome.article',
					iconPath: new vscode.ThemeIcon('thumbsup'),
					id: 'comment' + comment.Comment.Ci,
					description: time,
					resourceUri: linkCheck(comment.News.NewsLink),
					tooltip: new vscode.MarkdownString(`*${comment.Comment.C.replace(RegExp('[\n]+', 'g'), '*\n\n*')}*\n\n**${comment.News.NewsTitle}**\n\n*${time}*\n\n${user}`),
					command: { title: '查看内容', command: 'ith2ome.showContent', arguments: [comment.News.NewsTitle, comment.News.NewsId] },
					shareInfo: `${comment.Comment.C}\n\n标题：${comment.News.NewsTitle}\n时间：${time}\n用户：${user}\n`
				});
			}
			this.update.fire();
		});
		this.refreshTimer = setTimeout(() => { this.refresh(); }, 86400000); // 设置自动刷新时间
	}
	getChildren(element?: Ith2omeItem): vscode.TreeItem[] { // 获取项目列表
		if (element)
			return [];
		return this.list;
	}
	getTreeItem(element: Ith2omeItem): vscode.TreeItem { // 获取项目
		return element;
	}
}


class CalendarProvider implements vscode.TreeDataProvider<Ith2omeItem> { // 日历
	update = new vscode.EventEmitter<void>(); // 用于触发刷新
	readonly onDidChangeTreeData = this.update.event;
	list: Ith2omeItem[] = []; // 根级项目列表（日期父节点与“加载更多数据”）
	idSet: Set<string> = new Set(); // 事件 ID 集合
	dateMap: Map<string, Ith2omeItem> = new Map(); // 日期父节点集合，跨“加载更多”保留
	refreshTimer: NodeJS.Timeout | undefined; // 自动刷新计时器
	stamp: string = ''; // 信息流分页标记
	date: Date = new Date(); // 日程起始日期

	constructor() {
		this.refresh();
	}
	shift(month: number, day: number) { // 前后翻月、翻日
		this.date = new Date(this.date.getFullYear(), this.date.getMonth() + month, this.date.getDate() + day);
		this.refresh();
	}
	today() { // 回到今天
		this.date = new Date();
		this.refresh();
	}
	jumpTo(date: Date) { // 跳转到指定日期
		this.date = date;
		this.refresh();
	}
	refresh(loadMore: boolean = false) { // false 为手动刷新，true 为加载更多
		if (this.refreshTimer)
			clearTimeout(this.refreshTimer); // 清除下一次自动刷新计时器
		if (loadMore)
			this.list.pop(); // 移除“加载更多数据”
		else { // 手动刷新时清空项目列表
			this.list = [];
			this.idSet.clear();
			this.dateMap.clear();
			this.stamp = '';
		}
		let url = 'https://napi.ithome.com/api/newsevent/geteventfeed?forward=true&timeZone=' + encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
		if (this.stamp != '') // 加载更多只能传 stamp，与 date 同时传会被接口忽略
			url += '&stamp=' + encodeURIComponent(this.stamp);
		else
			url += '&date=' + dateKey(this.date);
		getJSON(url).then(res => {
			let data = res.body.data;
			this.stamp = data.stamp;
			for (let feed of data.list) {
				if (feed.feedType != 10026) // 仅处理事件分组
					continue;
				let anchor = feed.feedContent.anchor; // 分组所属日期
				let parent = this.dateMap.get(anchor);
				if (!parent) { // 同一日期只建一个父节点，跨“加载更多”复用
					parent = {
						label: eventDateFormat(anchor, Number(anchor.substring(0, 4)) == new Date().getFullYear()
							? { month: 'long', day: 'numeric' } // 当前年份不显示年份
							: { year: 'numeric', month: 'long', day: 'numeric' }),
						contextValue: 'ith2ome.calendarDate',
						description: eventDateFormat(anchor, { weekday: 'long' }),
						id: 'date' + anchor,
						collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
						children: []
					};
					this.dateMap.set(anchor, parent);
					this.list.push(parent);
				}
				for (let event of feed.feedContent.items) {
					let link = eventUrl(event.link);
					if (link == '' || this.idSet.has(link)) // 跳过异常链接与重复事件
						continue;
					this.idSet.add(link);
					let timeText = event.timeNotdecided ? '' : eventTimeFormat(event.realTime);
					let time = timeText == '' ? '待定' : timeText;
					let place = event.eventPlace ? event.eventPlace : (event.online ? '线上' : '');
					let realTime = timeText == '' ? eventDateFormat(event.realTime, { year: 'numeric', month: 'numeric', day: 'numeric' }) : new Date(event.realTime).toLocaleString('zh-CN');
					let tooltip = new vscode.MarkdownString(`**${event.title}**\n\n${realTime}${place != '' ? '｜' + place : ''}`);
					parent.children!.push({
						label: time + '｜' + event.title,
						contextValue: 'ith2ome.article',
						iconPath: new vscode.ThemeIcon('calendar'),
						id: 'event' + link,
						description: place,
						resourceUri: vscode.Uri.parse(link),
						tooltip: tooltip,
						shareInfo: `标题：${event.title}\n时间：${realTime}\n地点：${place}\n`
					});
				}
			}
			if (data.hasMore)
				this.list.push({
					label: '加载更多数据',
					iconPath: new vscode.ThemeIcon('eye'),
					command: { title: '加载更多数据', command: 'ith2ome.calendarRefresh', arguments: [true] }
				});
			this.update.fire();
		});
		this.refreshTimer = setTimeout(() => { this.refresh(); }, 86400000); // 设置自动刷新时间
	}
	getChildren(element?: Ith2omeItem): vscode.TreeItem[] { // 获取项目列表
		if (element)
			return element.children ?? [];
		return this.list;
	}
	getTreeItem(element: Ith2omeItem): vscode.TreeItem { // 获取项目
		return element;
	}
}

function updateUnreadBadge(count: number) { // 更新侧边栏未读数徽标
	latestTreeView.badge = showUnread && count > 0 ? { value: count, tooltip: `手动刷新后有 ${count} 篇新文章` } : undefined;
}

export async function activate(context: vscode.ExtensionContext) {
	extensionPath = context.extensionPath;
	extensionContext = context;
	await refreshConfig();
	period = <number>config.get('defaultPeriod'); // 仅在启动时从设置中读取
	let account = new AccountProvider();
	let search = new SearchProvider();
	let latest = new LatestProvider();
	let hot = new HotProvider();
	let comment = new CommentProvider();
	let calendar = new CalendarProvider();
	vscode.window.registerTreeDataProvider('ith2ome.account', account);
	vscode.window.registerTreeDataProvider('ith2ome.search', search);
	latestTreeView = vscode.window.createTreeView('ith2ome.latest', { treeDataProvider: latest }); // 需要视图句柄才能显示未读徽标
	context.subscriptions.push(latestTreeView);
	vscode.window.registerTreeDataProvider('ith2ome.hot', hot);
	vscode.window.registerTreeDataProvider('ith2ome.comment', comment);
	vscode.window.registerTreeDataProvider('ith2ome.calendar', calendar);
	context.subscriptions.push(
		vscode.commands.registerCommand('ith2ome.login', () => { // 登录通行证
			vscode.window.showInputBox({
				prompt: '获取 Cookie 的方法可查看插件说明',
				placeHolder: '请在此处输入您的 Cookie',
				password: true,
				ignoreFocusOut: true,
			}).then(async (hash = '') => {
				userHash = hash;
				await extensionContext.secrets.store('account', hash);
				account.refresh();
			});
		}),
		vscode.commands.registerCommand('ith2ome.logout', async () => { // 退出通行证
			userHash = '';
			await extensionContext.secrets.delete('account');
			vscode.window.showInformationMessage('退出成功！');
			account.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.accountRefresh', () => { // 刷新“通行证”
			refreshConfig();
			account.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.showContent', (title: string, id: string) => { // 显示新闻内容
			let session = ++contentSession; // 本次查看内容的会话令牌，丢弃切换内容后才返回的请求
			if (panel) { // 若标签页已存在
				panel.reveal(vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined);
				panel.title = titleFormat(title);
			} else { // 若标签页未开启或已关闭
				panel = vscode.window.createWebviewPanel('ith2ome', titleFormat(title), { preserveFocus: true, viewColumn: vscode.ViewColumn.One }, { enableScripts: true });
				panel.iconPath = vscode.Uri.file(path.join(extensionPath, 'img/icon.svg'));
				panel.webview.onDidReceiveMessage(
					message => {
						switch (message.command) {
							case 'showContent': // 打开之家文章
								vscode.commands.executeCommand('ith2ome.showContent', message.title, message.id);
								break;
							case 'voteArticle': // 文章投票
								voteArticle(panel!, message.id, message.type, message.grade, message.support, message.against);
								break;
							case 'voteComment': // 评论投票
								voteComment(panel!, message.id, message.type, message.grade, message.reply, message.support, message.against);
								break;
							case 'moreComments': // 加载更多评论
								loadComments(panel!, commentNewsId, contentSession, false);
								break;
							case 'showInfo':
								vscode.window.showInformationMessage(message.text);
								break;
							case 'showError':
								vscode.window.showErrorMessage(message.text);
								break;
						}
					},
					undefined,
					context.subscriptions
				);
				panel.onDidDispose(() => { panel = undefined; ++contentSession; }, null, context.subscriptions); // 关闭面板后作废在途请求
			}
			getJSON(`https://api.ithome.com/json/newscontent/${id}`).then(resNews => { // 获取新闻内容
				if (session != contentSession) // 已切换到其它内容
					return;
				panel!.title = titleFormat(resNews.body.title);
				let iframeList = resNews.body.detail.match(RegExp('<iframe[^>]*>[\\s\\S]*?</iframe>', 'g')) ?? []; // 匹配所有 iframe
				for (let iframe of iframeList) {
					let BVID = iframe.match(RegExp('(?<=bvid=)[0-9a-z]+', 'i'));
					if (BVID) {
						resNews.body.detail = resNews.body.detail.replace(iframe, '<div id="' + BVID + '" align="center"><h4><a href="https://www.bilibili.com/video/' + BVID + '">哔哩哔哩视频：信息加载中</a></h4></div>');
						getJSON('https://api.bilibili.com/x/web-interface/view?bvid=' + BVID).then(resBiliVideo => { // 加载B站视频信息
							if (session != contentSession) // 已切换到其它内容
								return;
							let biliVideoData = resBiliVideo.body.data;
							panel!.webview.html = panel!.webview.html.replace(RegExp(`<div id="${BVID}.*?</div>`), '<div align="center" style="border:solid#FB7299"><h4><a href="https://www.bilibili.com/video/' + BVID + `">哔哩哔哩视频：${biliVideoData.title}</a></h4>` + (imageWidth > 0 ? `<img src="${biliVideoData.pic}" alt="哔哩哔哩视频封面"` + (imageScaleMethod == 2 ? ' onclick="this.classList.toggle(\'img-zoom\')"/>' : '/>') : '') + `<table style="border-spacing:1.5em 0.5em"><tr><th>观看</th><th>弹幕</th><th>评论</th><th>点赞</th><th>投币</th><th>收藏</th><th>转发</th><th>发布时间</th></tr><tr><td>${numberFormat(biliVideoData.stat.view)}</td><td>${numberFormat(biliVideoData.stat.danmaku)}</td><td>${numberFormat(biliVideoData.stat.reply)}</td><td>${numberFormat(biliVideoData.stat.like)}</td><td>${numberFormat(biliVideoData.stat.coin)}</td><td>${numberFormat(biliVideoData.stat.favorite)}</td><td>${numberFormat(biliVideoData.stat.share)}</td><td>${new Date(biliVideoData.pubdate * 1000).toLocaleString('zh-CN')}</td></tr></table><table style="text-align:center;border-spacing:2em 0em;padding-bottom:1em"><tr>` + (imageWidth > 0 ? `<td style="min-width:6em"><img class="video-avatar" src="${biliVideoData.owner.face}"><br>` : '<td>') + `<strong><a href="https://space.bilibili.com/${biliVideoData.owner.mid}">${biliVideoData.owner.name}</a></strong></td><td><p style="white-space:pre-wrap;text-align:left">${biliVideoData.desc}</p></td></tr></table></div>`);
						});
					} else { // 秒拍视频
						let miaopaiHref = iframe.match(RegExp('(?<=src=")https://v\\.miaopai\\.com[^"]*'))?.[0];
						let miaopaiScid = miaopaiHref ? miaopaiHref.match(RegExp('(?<=scid=).*'))?.[0] : undefined;
						if (miaopaiHref && miaopaiScid)
							resNews.body.detail = resNews.body.detail.replace(iframe, `<div align="center" style="border:solid#FCEA4F"><h4><a href="${miaopaiHref}">秒拍视频</a></h4>` + (videoWidth > 0 ? `<video controls="controls" style="max-width:100%;width:${videoWidth}px" poster="http://imgaliyuncdn.miaopai.com/stream/${miaopaiScid}_m.jpg" src="https://gslb.miaopai.com/stream/${miaopaiScid}.mp4"></video>` : '#视频已屏蔽#') + '</div>'); // 替换秒拍视频信息
					}
				}
				let weiboVideoList = resNews.body.detail.match(RegExp('<a[^>]*class="ithome_super_player"[^>]*>[\\s\\S]*?</a>', 'g')) ?? []; // 匹配微博视频
				for (let weiboVideo of weiboVideoList) {
					let weiboHref = weiboVideo.match(RegExp('(?<=href=").*?(?=")'))?.[0];
					let weiboPic = weiboVideo.match(RegExp('(?<=<img src=").*?(?=")'))?.[0];
					if (weiboHref)
						resNews.body.detail = resNews.body.detail.replace(weiboVideo, '<div align="center" style="border:solid#D13A34"><h4><a href="' + weiboHref + '">微博视频</a></h4>' + (weiboPic && imageWidth > 0 ? `<img src="${weiboPic}" alt="微博视频封面"` + (imageScaleMethod == 2 ? ' onclick="this.classList.toggle(\'img-zoom\')"/>' : '/>') : '') + '</div>');
				}
				resNews.body.detail = linkFormat(resNews.body.detail); // 匹配之家文章链接
				if (hideAdTips)
					resNews.body.detail = resNews.body.detail.replace(RegExp('<p class="ad-tips"[\\S]+</p>'), '');
				panel!.webview.html = '<head><style>'
					+ (resNews.body.btheme ? 'body{filter:grayscale(100%)}' : '') // 是否灰度
					+ (imageWidth > 0 ? `img{width:${imageWidth}px;transition:0.5s}` + (imageScaleMethod < 2 && imageScale != 1.0 ? `img:${imageScaleMethodWord}{transform:scale(${imageScale})}` : '') : '') // 正文图片宽度、缩放
					+ `img.img-zoom{transform:scale(${imageScale})}` // 正文图片缩放
					+ (commentImageWidth > 0 ? `img.comment{width:${commentImageWidth}px}` + (imageScaleMethod < 2 && commentImageScale != 1.0 ? `img.comment:${imageScaleMethodWord}{transform:scale(${commentImageScale})}` : '') : '') // 评论图片宽度、缩放
					+ `img.img-comment-zoom{transform:scale(${imageScale})}` // 评论图片缩放
					+ 'img.avatar{float:left;height:4em;width:4em;border-radius:50%;transform:none}img.video-avatar{height:6em;width:6em;border-radius:50%;transform:none}' // 头像样式
					+ 'blockquote{margin:0.5em;padding:0.5em;border-left:3px solid #007acc;font-style:italic}' // 引文样式
					+ '#grade{display:block;text-align:center}' // 文章质量得分样式
					+ '.voted{outline:1px solid;font-weight:bold;text-decoration:none}' // 已投票样式
					+ `.support{cursor:pointer;color:#28BD98;margin-right:3em}` // 支持样式
					+ `.against{cursor:pointer;color:#FF6F6F}` // 反对样式
					+ `.blur{filter:blur(0.5em)}`
					+ `.blur:hover{filter:blur();transition:0.5s}`
					+ '#scroll-to-top{position:absolute;width:40px;height:40px;right:5px;margin-top:calc(100vh - 65px);background-color:var(--vscode-button-background,#444);border-color:var(--vscode-button-border);border-radius:50%;cursor:pointer;box-shadow:1px 1px 1px rgba(0,0,0,.25);outline:none;display:flex;justify-content:center;align-items:center;}' // 回到顶部按钮样式
					+ '#scroll-to-top:hover{background-color:var(--vscode-button-hoverBackground);box-shadow:2px 2px 2px rgba(0,0,0,.25);}' // 回到顶部按钮悬浮样式
					+ '</style><script>'
					+ 'let vscode=acquireVsCodeApi();'
					+ `function ITH2OmeOpen(title,id) {
						vscode.postMessage({command:"showContent",title,id});
					}` // 打开相关文章
					+ `function voteArticleWebview(articleId,grade,support,against) {
						if (articleId < 0)
							vscode.postMessage({command:"showError", text:"请先取消投票！"});
						else if (grade < 0)
							vscode.postMessage({command:"voteArticle", id:${id}, type:"cancel", grade: grade + 3, support, against});
						else
							vscode.postMessage({command:"voteArticle", id:${id}, type:"create", grade, support, against});
					}` // 文章质量投票
					+ `function voteCommentWebview(commentId,grade,reply,support,against) {
						if (grade == 0)
							vscode.postMessage({command:"showError", text:"请先取消投票！"});
						else if (grade < 0)
							vscode.postMessage({command:"voteComment", id:commentId, type:"cancelvote", grade: -grade, reply, support, against});
						else
							vscode.postMessage({command:"voteComment", id:commentId, type:"vote", grade, reply, support, against});
					}` // 评论投票
					+ `function loadMoreComments() {
						let more = document.querySelector("#commentmore a");
						if (!more || more.dataset.loading) return;
						more.dataset.loading = "1";
						more.innerText = "评论加载中 ...";
						vscode.postMessage({command:"moreComments"});
					}` // 加载更多评论
					+ `function autoLoadComments() {
						let more = document.getElementById("commentmore");
						if (more && more.getBoundingClientRect().top <= window.innerHeight + 200) loadMoreComments();
					}` // 滚动到底自动加载评论
					+ `window.addEventListener("message", event=>{
						const message = event.data;
						if (message.command == "refreshGrade") // 更新投票信息
							document.getElementById("grade").innerHTML = message.text;
						else if (message.command == "refreshVote") // 更新评论信息
							for (let prefix of ["top-", "hot-", ""]) {
								let target = document.getElementById("vote-"+prefix+message.id);
								if (target)
									target.innerHTML = message.text;
							}
						else if (message.command == "appendComments") { // 追加评论
							let more = document.getElementById("commentmore");
							if (more) {
								more.insertAdjacentHTML("beforebegin", message.text);
								let link = more.querySelector("a");
								if (link) {
									link.dataset.loading = "";
									link.innerText = "加载更多评论 ...";
								}
							}
							autoLoadComments();
						}
						else if (message.command == "commentsDone") { // 评论已全部加载，移除加载链接
							let more = document.getElementById("commentmore");
							if (more) more.remove();
						}
						else if (message.command == "commentsError") { // 评论加载失败，点击重试
							let link = document.querySelector("#commentmore a");
							if (link) {
								link.dataset.loading = "";
								link.innerText = "加载失败，点击重试";
							}
						}
					});
					window.addEventListener("DOMContentLoaded", autoLoadComments);window.addEventListener("scroll", autoLoadComments);`
					+ `</script></head><h1>${resNews.body.title}</h1>` // 标题
					+ `<h3>新闻源：${resNews.body.newssource}（${resNews.body.newsauthor}）｜责编：${resNews.body.z}</h3>` // 新闻源、责编
					+ `<h4>${new Date(resNews.body.postdate).toLocaleString('zh-CN')}</h4>` // 发布时间
					+ '<div style="position:sticky;top:0px"><a id="scroll-to-top" onclick="window.scrollTo({top:0,behavior:\'smooth\'});" aria-label="回到顶部"><img style="transform:none" src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=" width="16" height="16"></a></div>' // 回到顶部按钮
					+ `${imageWidth <= 0 ? resNews.body.detail.replace(RegExp('<img[\\s\\S]*?>', 'g'), '#图片已屏蔽#') : (imageScaleMethod == 2 ? resNews.body.detail.replace(RegExp('<img ', 'g'), '<img onclick="this.classList.toggle(\'img-zoom\')"') : resNews.body.detail)}`; // 图片屏蔽/添加缩放命令
				panel!.webview.html += '<div id="grade">文章质量得分加载中</div>'
				getJSON(`https://dyn.ithome.com/api/newsgrade/get?newsID=${id}` + (userId != -1 ? `&userID=${userId}` : '')).then(resGrade => {
					if (session != contentSession) // 已切换到其它内容
						return;
					panel!.webview.html = panel!.webview.html.replace('文章质量得分加载中', gradeFormat(Number(id), resGrade.body.me, resGrade.body.Grade, resGrade.body.g3, resGrade.body.g1));
				});
				if (showRelated) { // 显示相关文章
					panel!.webview.html += '<hr><h2>相关文章</h2>';
					getJSON(`https://napi.ithome.com/api/news/getrelatednews/${id}`).then(resRelate => {
						if (session != contentSession) // 已切换到其它内容
							return;
						let text = '<h2>相关文章</h2><ul>';
						let relateList = resRelate.body.data.relatedNewsResponseModels;
						for (let relatedNews of relateList)
							text += `<li><a href="" onclick="ITH2OmeOpen('${relatedNews.newstitle}',${relatedNews.newsid})">${relatedNews.newstitle}</a></li>`;
						panel!.webview.html = panel!.webview.html.replace('<h2>相关文章</h2>', text + '</ul>');
					});
				}
				if (showComment) { // 显示网友评论
					panel!.webview.html += '<hr><h2>评论区加载中</h2>';
					loadComments(panel!, id, session, true);
				}
			});
		}),
		vscode.commands.registerCommand('ith2ome.share', (item: Ith2omeItem) => { // 分享新闻
			vscode.env.clipboard.writeText(item.shareInfo! + item.resourceUri).then(() => {
				vscode.window.showInformationMessage('新闻复制成功！');
			});
		}),
		vscode.commands.registerCommand('ith2ome.openBrowser', (item: vscode.TreeItem) => { // 在浏览器中查看
			vscode.commands.executeCommand('vscode.open', item.resourceUri);
		}),
		vscode.commands.registerCommand('ith2ome.searchNew', async () => { // 新建一次搜索
			refreshConfig();
			let keyword = await vscode.window.showInputBox({
				prompt: '请输入搜索关键词',
				ignoreFocusOut: true,
			});
			if (keyword == undefined || keyword.trim() == '')
				return;
			search.search(keyword.trim());
		}),
		vscode.commands.registerCommand('ith2ome.searchMore', (node: Ith2omeItem) => { // 加载该次搜索的更多结果，仅供树内使用
			search.loadMore(<SearchItem>node);
		}),
		vscode.commands.registerCommand('ith2ome.searchDelete', (node: Ith2omeItem) => { // 删除单次搜索
			search.delete(node);
		}),
		vscode.commands.registerCommand('ith2ome.searchClear', () => { // 清空全部搜索
			search.clear();
		}),
		vscode.commands.registerCommand('ith2ome.latestRefresh', (refreshType: number) => { // 刷新“最新”
			refreshConfig();
			if (typeof refreshType != 'number')
				refreshType = 0; // 有时 VS Code 会返回一个 ith2omeItem，原因不明
			latest.refresh(refreshType);
		}),
		vscode.commands.registerCommand('ith2ome.loadTopic', (element: Ith2omeItem) => { // 加载专题子文章，仅供树内使用
			element.topicPromise = undefined;
			latest.update.fire(element);
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
		}),
		vscode.commands.registerCommand('ith2ome.calendarRefresh', (loadMore: boolean) => { // 刷新“日历”，手动刷新回到今天
			refreshConfig();
			if (typeof loadMore == 'boolean' && loadMore) // 有时 VS Code 会返回一个 ith2omeItem，原因不明
				calendar.refresh(true); // 加载更多，保持当前起始日
			else
				calendar.today(); // 手动刷新回到今天
		}),
		vscode.commands.registerCommand('ith2ome.calendarPrevMonth', () => { // “日历”前翻一月
			calendar.shift(-1, 0);
		}),
		vscode.commands.registerCommand('ith2ome.calendarPrevWeek', () => { // “日历”前翻一周
			calendar.shift(0, -7);
		}),
		vscode.commands.registerCommand('ith2ome.calendarGoto', async () => { // “日历”跳转到指定日期
			let value = await vscode.window.showInputBox({
				prompt: '请输入要跳转的日期',
				placeHolder: 'YYYYMMDD，或仅 MMDD（默认当前年份）',
				value: dateKey(calendar.date).replaceAll('-', ''),
				validateInput: text => parseDateKey(text) ? undefined : '请输入 YYYYMMDD 或 MMDD 格式的有效日期'
			});
			if (value == undefined)
				return;
			let date = parseDateKey(value);
			if (date)
				calendar.jumpTo(date);
		}),
		vscode.commands.registerCommand('ith2ome.calendarNextWeek', () => { // “日历”后翻一周
			calendar.shift(0, 7);
		}),
		vscode.commands.registerCommand('ith2ome.calendarNextMonth', () => { // “日历”后翻一月
			calendar.shift(1, 0);
		})
	);
}

export function deactivate() { }
