// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import feedparser = require('feedparser')
import parse from 'node-html-parser';
import * as superagent from 'superagent';

class contentProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
	private list: vscode.TreeItem[] = [];
	private autoRefresh: number = 0;
	private mode: number = 0;
	private refreshTimer: NodeJS.Timeout | undefined;
	private block: boolean = false;
	private blockWords: string[] = [];
	private keys: string[] = [];
	private period: number = <number>vscode.workspace.getConfiguration('ith2ome').get('defaultPeriod');

	constructor(_mode: number) {
		this.mode = _mode;
		this.refresh();
	}
	refresh() {
		if (this.refreshTimer)
			clearTimeout(this.refreshTimer);
		this.list = [];
		this.block = <boolean>vscode.workspace.getConfiguration('ith2ome').get('blockImages');
		this.keys = <string[]>vscode.workspace.getConfiguration('ith2ome').get('keyWords');
		if (this.mode == 0) {
			this.autoRefresh = <number>vscode.workspace.getConfiguration('ith2ome').get('autoRefresh');
			this.blockWords = <string[]>vscode.workspace.getConfiguration('ith2ome').get('blockWords');
			var feed = new feedparser({});
			var item: feedparser.Item;
			superagent.get('https://www.ithome.com/rss/').pipe(feed);
			feed.on('readable', () => {
				var meta = feed.meta;
				while (item = feed.read()) {
					var hide = false;
					for (var i in this.blockWords)
						if (item.title.includes(this.blockWords[i])) {
							hide = true;
							break;
						}
					if (!hide) {
						var highlights: [number, number][] = [];
						var loc: number;
						let time = (<Date>item.pubdate).toLocaleString('zh-CN');
						for (var i in this.keys)
							if ((loc = item.title.indexOf(this.keys[i])) != -1)
								highlights.push([loc, loc + this.keys[i].length]);
						this.list.push({
							label: {
								highlights: highlights,
								label: item.title
							},
							iconPath: new vscode.ThemeIcon("preview"),
							description: time,
							resourceUri: vscode.Uri.parse(item.link),
							tooltip: new vscode.MarkdownString(`**${item.title}**\n\n*${time}*\n\n点击查看正文`),
							command: {
								title: '查看内容',
								command: 'ith2ome.showContent',
								arguments: [item.title, time, this.block ? item.description.replace(RegExp("<img.*?>", "g"), '#图片已屏蔽#') : item.description],
							}
						});
					}
				}
				this._onDidChangeTreeData.fire();
			});
			if (this.autoRefresh > 0)
				this.refreshTimer = setTimeout(() => { this.refresh(); }, this.autoRefresh * 1000);
		}
		else if (this.mode == 1) {
			superagent.get('https://www.ithome.com/').end((err, res) => {
				let lis = parse(res.text).querySelector('#rank').querySelector(`#d-${this.period + 1}`).querySelectorAll('a')
				for (var i in lis) {
					var highlights: [number, number][] = [];
					var loc: number;
					for (var j in this.keys)
						if ((loc = lis[i].attributes.title.indexOf(this.keys[j])) != -1)
							highlights.push([loc, loc + this.keys[j].length]);
					this.list.push({
						label: {
							highlights: highlights,
							label: lis[i].attributes.title
						},
						iconPath: new vscode.ThemeIcon("flame"),
						id: lis[i].attributes.href,
						resourceUri: vscode.Uri.parse(lis[i].attributes.href),
						tooltip: new vscode.MarkdownString(`**${lis[i].attributes.title}**`)
					});
				}
				this._onDidChangeTreeData.fire();
			});
			this.refreshTimer = setTimeout(() => { this.refresh(); }, 86400000);
		}
		else if (this.mode == 2) {
			superagent.get('http://cmt.ithome.com/api/comment/hotcommentlist/').end((err, res) => {
				let commentList = res.body.content.commentlist
				for (var i in commentList) {
					let time = new Date(commentList[i].Comment.T).toLocaleString('zh-CN')
					let locLength = commentList[i].Comment.Y.length
					this.list.push({
						label: `${commentList[i].Comment.S} | ${commentList[i].Comment.C.replace('\n', ' ')}`,
						iconPath: new vscode.ThemeIcon("thumbsup"),
						id: commentList[i].Comment.Ci,
						description: time,
						resourceUri: vscode.Uri.parse(commentList[i].News.NewsLink),
						tooltip: new vscode.MarkdownString(`*${commentList[i].Comment.C.replace('\n', '*\n\n*')}*\n\n**${commentList[i].News.NewsTitle}**\n\n*${time}*\n\n${commentList[i].Comment.N}` + (locLength > 6 ? ` @ ${commentList[i].Comment.Y.substring(4, locLength - 2)}` : ''))
					});
				}
				this._onDidChangeTreeData.fire();
			});
			this.refreshTimer = setTimeout(() => { this.refresh(); }, 86400000);
		}
	}
	switchPeriod(p: number) {
		this.period = Math.min(Math.max(0, p), 2);
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
	let latest = new contentProvider(0);
	let currentPanel: vscode.WebviewPanel | undefined = undefined;
	let hot = new contentProvider(1);
	let comment = new contentProvider(2);
	vscode.window.registerTreeDataProvider('latest', latest);
	vscode.window.registerTreeDataProvider('hot', hot);
	vscode.window.registerTreeDataProvider('comment', comment);
	context.subscriptions.push(
		vscode.commands.registerCommand('ith2ome.latestRefresh', () => {
			latest.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.showContent', (title: string, time: string, content: string) => {
			const columnToShowIn = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
			if (currentPanel)
				currentPanel.reveal(columnToShowIn);
			else
				currentPanel = vscode.window.createWebviewPanel(
					'content',
					'ITH2Ome: 预览',
					{ preserveFocus: true, viewColumn: vscode.ViewColumn.One }
				);
			currentPanel.webview.html = `<h1>${title}</h1><h4>${time}</h4>${content}`;
			currentPanel.onDidDispose(
				() => {
					currentPanel = undefined;
				},
				null,
				context.subscriptions
			)
		}),
		vscode.commands.registerCommand('ith2ome.hotRefresh', () => {
			hot.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.daily', () => {
			hot.switchPeriod(0);
		}),
		vscode.commands.registerCommand('ith2ome.weekly', () => {
			hot.switchPeriod(1);
		}),
		vscode.commands.registerCommand('ith2ome.monthly', () => {
			hot.switchPeriod(2);
		}),
		vscode.commands.registerCommand('ith2ome.commentRefresh', () => {
			comment.refresh();
		}),
		vscode.commands.registerCommand('ith2ome.openBrowser', (item: vscode.TreeItem) => {
			vscode.commands.executeCommand('vscode.open', item.resourceUri);
		})
	);
}

export function deactivate() { }
