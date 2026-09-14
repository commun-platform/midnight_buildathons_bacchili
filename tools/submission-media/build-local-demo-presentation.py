#!/usr/bin/env python3
"""Compose a judge-readable motion presentation from the approved Wallet UC capture."""
import argparse
import copy
import datetime
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
EDITION = 'local-demo-presentation-20260912'
BG, PANEL, LINE = '0B1220', '152237', '2C4055'
WHITE, MUTED, MINT, VIOLET, AMBER = 'F2F5F1', 'A7B8C8', 'A4F4CF', 'B6AEFF', 'FFC28C'
SCREEN = (624, 260, 1216, 684)


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


focus = module('presentation_focus', 'build-local-demo-focus.py')
baseline = module('presentation_baseline', 'build-local-demo-video.py')
media = baseline.media
sha256, run, probe = focus.sha256, focus.run, focus.probe


def color(rgb):
    return focus.ass_color(rgb)


def safe(value):
    if any(c in value for c in '{}\\'):
        raise ValueError('Presentation text cannot contain ASS commands')
    return value.replace('\n', r'\N')


class Canvas:
    """Timed text and vector shapes, with a reserved subtitle band below y=970."""
    def __init__(self, duration, light=False):
        self.duration, self.light, self.events = duration, light, []
        self.ink = BG if light else WHITE
        self.muted = '516575' if light else MUTED
        self.accent = '126E57' if light else MINT
        self.panel = 'E4EAE5' if light else PANEL
        self.background = 'F1F3EC' if light else BG

    def event(self, start, end, layer, tags, payload):
        end = self.duration if end is None else end
        if not 0 <= start < end <= self.duration + .01:
            raise ValueError(f'Invalid animation interval {start}..{end}')
        self.events.append(f'Dialogue: {layer},{focus.ass_time(start)},{focus.ass_time(end)},Motion,,0,0,0,,{{{tags}}}{payload}')

    def rect(self, x, y, w, h, fill, start=0, end=None, layer=2, alpha='00', grow=0):
        tags = rf'\an7\pos(0,0)\p1\bord0\shad0\1c{color(fill)}\1a&H{alpha}&'
        if start > 0:
            tags += r'\fad(220,100)'
        if grow:
            tags += rf'\clip({x},{y},{x},{y+h})\t(0,{round(grow*1000)},\clip({x},{y},{x+w},{y+h}))'
        self.event(start, end, layer, tags, focus.shape(x, y, w, h))

    def outline(self, x, y, w, h, fill, start=0, end=None, layer=5, width=3):
        self.event(start, end, layer, rf'\an7\pos(0,0)\p1\shad0\1a&HFF&\3c{color(fill)}\3a&H00&\bord{width}\fad(180,130)', focus.shape(x,y,w,h))

    def text(self, value, x, y, size=36, fill=None, start=0, end=None, bold=False, layer=6, move=True, align=7):
        tags = rf'\an{align}\fs{size}\b{1 if bold else 0}\bord0\shad0\1c{color(fill or self.ink)}'
        tags += rf'\move({x},{y+16},{x},{y},0,420)' if move else rf'\pos({x},{y})'
        tags += r'\fad(260,140)'
        self.event(start, end, layer, tags, safe(value))

    def arrow(self, x1, x2, y, start, end=None, fill=None):
        fill = fill or self.accent
        self.rect(x1,y,x2-x1,3,fill,start,end,grow=.6)
        self.event(start+.45,end,4,rf'\an7\pos(0,0)\p1\bord0\1c{color(fill)}\fad(160,120)',f'm {x2-13} {y-9} l {x2+1} {y+1} {x2-13} {y+11}')

    def card(self, x, y, w, h, tag, title, body, start=0, fill=None):
        fill = fill or self.accent
        self.rect(x,y,w,h,self.panel,start)
        self.rect(x,y,5,h,fill,start,grow=.3)
        self.text(tag,x+28,y+24,23,fill,start,bold=True)
        self.text(title,x+28,y+74,43,start=start,bold=True)
        self.text(body,x+28,y+145,29,self.muted,start+.2)

    def header(self, number, section, title, subtitle=None):
        self.text('BACCHIRI!',76,32,27,self.accent,bold=True,move=False)
        self.text('VERIFIABLE MEASUREMENT',267,37,18,self.muted,move=False)
        labels = ['01  価値','02  操作','03  仕組み','04  次へ']
        for i, label in enumerate(labels):
            x = 1210+i*157
            self.text(label,x,39,22,self.accent if i==section else self.muted,bold=i==section,move=False)
            if i==section:
                self.rect(x,80,115,3,self.accent,grow=.6)
        self.text(title,76,123,62,start=.08,bold=True)
        if subtitle:
            self.text(subtitle,80,204,28,self.muted,start=.25)
        self.rect(76,958,1764,1,LINE if not self.light else 'CFD8D0')
        self.text('撮影用シミュレーション',78,928,17,self.muted,move=False)
        self.text(f'{number:02} / 15',450,928,17,self.muted,move=False)
        self.rect(0,1076,1920,4,self.accent,grow=self.duration)

    def grid(self, x, y, cell=50, gap=10, start=0, missing=0, outline=False):
        for i in range(24):
            px,py=x+(i%8)*(cell+gap),y+(i//8)*(cell+gap)
            active = i < 24-missing
            shade = self.accent if active else self.muted
            self.rect(px,py,cell,cell,self.panel,start)
            if active and not outline:
                self.rect(px,py,cell,cell,shade,start+.035*i+.15)
            else:
                self.outline(px+2,py+2,cell-4,cell-4,shade,start+.035*i+.15,width=2)
            self.text(f'{i:02}',px+cell/2,py+cell/2,17,BG if active and not outline else self.ink,start+.035*i+.25,align=5,move=False)

    def write(self, file, captions):
        # Captions always live on their own dark band, including light scenes.
        self.rect(0,970,1920,106,BG,layer=15)
        for start,end,words in captions:
            self.event(start,end,20,r'\an2\pos(960,1051)\fs39\b0\bord0\shad0\1c&HFFFFFF&',safe(words))
        header = ('[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2\nScaledBorderAndShadow: yes\n'
            '[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
            'Style: Motion,Noto Sans CJK JP,36,&H00FFFFFF,&H00FFFFFF,&H00120B08,&H00120B08,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n'
            '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n')
        file.write_text(header+'\n'.join(self.events)+'\n')


# Rectangles are original browser pixels. Source time always equals scene time.
# The camera moves to a detail, holds while it is discussed, then returns before scrolling.
CAMERAS = {
    'device': [(0.5,4.8,[930,36,990,557]), (7,10.1,[66,494,1136,639]), (18.3,21.4,[922,234,966,544])],
    'day': [(3.1,6.7,[65,82,1260,709]), (10,12.7,[66,116,1190,669]), (15.4,21.1,[66,449,1240,698])],
    'request': [(3.9,7.3,[60,196,978,550]), (7.5,10.7,[926,188,974,548]), (14.3,21.2,[928,213,974,548])],
    'confirmed': [(1.1,13.9,[922,141,974,548]), (14.2,17.5,[60,112,988,556]), (17.6,21.1,[921,105,974,548])],
    'verify': [(2.3,3.8,[68,329,1180,664]), (5.8,7,[68,329,1180,664]), (9.3,11.9,[1110,528,802,451]), (14.5,20.8,[938,169,946,532])],
    'scenarios': [(6.1,8.4,[622,196,1270,714]), (10.1,12.6,[622,177,1270,714]), (18.4,22.5,[929,489,962,541])],
    'managed': [(2.3,6,[213,142,1470,827]), (10.6,13.25,[240,95,1460,821]), (13.4,17,[828,173,862,485]), (17.2,21.4,[951,399,742,417])],
    'operations': [(2.3,4.3,[28,306,1260,709]), (7.2,8.4,[500,75,1380,776]), (13,17.6,[471,202,978,550]), (17.8,21.5,[470,385,978,550])],
}

GUI = {
    'device': ('01','条件を結び付ける。',['Walletで認証','登録内容を承認','Deviceに条件を割当'], ['認証する','内容を確認する','測定前に登録する'],MINT),
    'day': ('02','非公開のまま、\n証明に備える。',['24の時間枠','対象日と件数','実値と公開判定を分離'],['集計する','入力を確認する','公開範囲を分ける'],MINT),
    'request': ('03','依頼から、\n取引準備へ。',['Proof Job ID','証明生成・取引準備','準備後にWallet承認'],['依頼する','Jobで追跡する','承認へ進む'],VIOLET),
    'confirmed': ('04','承認と手数料を\n役割で分ける。',['Device Wallet：承認','Sponsor：DUST負担','Midnight：記録確認'],['内容を承認する','手数料を付けて送信','TX識別子を追う'],VIOLET),
    'verify': ('05','実値を受け取らず、\n根拠を確かめる。',['共有されたTX識別子','日付・条件・記録を照合','時間ごとの判定'],['TXから照合する','整合性を確かめる','公開結果を見る'],'126E57'),
    'scenarios': ('＋','異常と不足を、\n区別できる。',['範囲外を表示','欠測を補完しない','不正な入力を拒否'],['範囲外','欠測','拒否を確認'],AMBER),
    'managed': ('API','既存クラウドへ、\n公開検証を追加。',['計測元と条件を登録','Service Walletが処理','検証できる結果を共有'],['接続する','処理を追跡する','結果を共有する'],MINT),
    'operations': ('OPS','日々の処理を、\n運用で支える。',['サービス・Walletの状態','日次指標とイベント','必要なJobを調査'],['状態を見る','指標を見る','イベントを調べる'],VIOLET),
}


def normalize_camera(rect):
    x,y,w,h = rect
    if not all(math.isfinite(v) for v in rect) or w<=0 or h<=0:
        raise ValueError('Invalid camera rectangle')
    w = min(1920,max(w,h*16/9))
    h = w*9/16
    return [max(0,min(1920-w,x)),max(0,min(1080-h,y)),w,h]


def camera_keys(sid, duration):
    keys = [(0,[0,0,1920,1080])]
    for start,end,rect in CAMERAS[sid]:
        if start < keys[-1][0] or not start+.35 < end <= duration:
            raise ValueError(f'Invalid camera sequence: {sid}')
        previous = keys[-1][1]
        keys.extend([(start,previous),(start+.35,normalize_camera(rect)),(end,normalize_camera(rect))])
        # Return to the overview during an actual scroll; otherwise pan directly.
        next_index = [a for a,b,c in CAMERAS[sid] if a>end]
        if not next_index or next_index[0]-end>.75:
            keys.append((min(end+.4,duration),[0,0,1920,1080]))
    if keys[-1][0]<duration:
        keys.append((duration,keys[-1][1]))
    return keys


def at_camera(keys, time):
    for (a,ra),(b,rb) in zip(keys,keys[1:]):
        if a<=time<=b and b>a:
            p=(time-a)/(b-a)
            p=p*p*(3-2*p)
            return [v+(w-v)*p for v,w in zip(ra,rb)]
    return keys[-1][1]


def camera_expression(keys, index):
    expression = f'{keys[-1][1][index]:.6f}'
    for (a,ra),(b,rb) in reversed(list(zip(keys,keys[1:]))):
        if b<=a:
            continue
        va,vb=ra[index],rb[index]
        p=f'((on/30-{a:.6f})/{b-a:.6f})'
        v = f'{va:.6f}' if abs(va-vb)<1e-6 else f'({va:.6f}+{vb-va:.6f}*{p}*{p}*(3-2*{p}))'
        expression=f'if(lt(on/30,{b:.6f}),{v},{expression})'
    return expression


def gui_scene(c, sid, cues, duration):
    number,title,points,steps,accent=GUI[sid]
    c.text(number,77,279,89,accent,bold=True)
    c.text(title,78,398,46,start=.35,bold=True)
    c.rect(80,557,436,2,LINE if not c.light else 'C7D3CB')
    if sid=='day':
        c.text('非公開の証明入力 / 24時間',80,582,24,accent,.6,bold=True)
        c.grid(82,634,42,12,start=1,outline=True)
        c.text('公開するのは、必要な判定。',80,809,25,MUTED,13)
    elif sid=='confirmed':
        c.text('承認から公開記録への流れ',80,576,23,c.muted,.6)
        roles=[('Device Wallet','内容を確認・承認',VIOLET,.8),('Sponsor Wallet','DUSTを付けて送信',AMBER,6),('Midnight','TX識別子で記録を確認',MINT,14.2)]
        for i,(role,action,shade,t) in enumerate(roles):
            y=621+i*71
            c.rect(80,y,438,61,PANEL,t)
            c.rect(80,y,4,61,shade,t)
            c.text(role,98,y+5,23,shade,t,bold=True)
            c.text(action,98,y+32,21,WHITE,t)
            if i<2:
                c.text('↓',479,y+44,28,shade,t,layer=8,move=False)
    elif sid=='scenarios':
        c.text('公開結果で、違いが分かる',80,582,24,c.muted,.6)
        for i,(label,detail,shade,t) in enumerate([('範囲外','条件を満たさない',AMBER,1),('欠測','情報が不足している',MUTED,3),('拒否','不正な入力を受け付けない',VIOLET,5)]):
            y=631+i*67
            c.rect(80,y,111,48,PANEL,t)
            c.outline(80,y,111,48,shade,t,width=2)
            c.text(label,95,y+9,27,shade,t,bold=True)
            c.text(detail,211,y+12,21,start=t)
    else:
        c.text('この操作で確かめること',80,582,22,c.muted,start=.6)
        for i,point in enumerate(points):
            t=[.8,7.4,14.2][i]
            c.rect(80,638+i*72,7,36,accent,t)
            c.text(point,102,635+i*72,27,start=t)
    c.rect(620,213,1224,47,c.panel)
    c.outline(622,258,1220,688,LINE,width=2)
    c.text('RECORDED DEMO',648,226,19,c.muted,move=False)
    c.text(' / '.join(steps),960,226,19,c.muted,move=False)
    # The footage occupies y=260..944; header and captions never overlap it.
    keys=camera_keys(sid,duration)
    for cue in cues:
        s,e=cue['start'],cue['end']
        c.text(cue['label'],80,851,26,accent,s,e,bold=True,move=False)
        # Draw only the visible portion of a stable narrated target after movement.
        begin=s+.42
        if begin>=e-.15:
            continue
        cam=at_camera(keys,begin)
        endcam=at_camera(keys,e-.15)
        if max(abs(a-b) for a,b in zip(cam,endcam))>2:
            continue
        x,y,w,h=cue['rect']
        cx,cy,cw,ch=cam
        x1,y1=max(x,cx),max(y,cy)
        x2,y2=min(x+w,cx+cw),min(y+h,cy+ch)
        if x2-x1<20 or y2-y1<15:
            continue
        scale=SCREEN[2]/cw
        px,py=SCREEN[0]+(x1-cx)*scale,SCREEN[1]+(y1-cy)*scale
        pw,ph=(x2-x1)*scale,(y2-y1)*scale
        # A fine outline and corner accent preserve GUI contrast; no repeated dimming.
        c.outline(round(px)+3,round(py)+3,round(pw)-6,round(ph)-6,accent,begin,e,width=2)
        c.rect(round(px)+3,round(py)+3,min(70,round(pw)-6),5,accent,begin,e,layer=6)
    return keys


def authored_scene(c, sid, duration):
    if sid=='value':
        c.text('測定値を渡さず、',80,288,94,bold=True,start=.1)
        c.text('判定の根拠を届ける。',80,408,94,MINT,bold=True,start=1.45)
        c.text('組織をまたぐ計測報告に、確認できる証拠を。',84,578,36,MUTED,start=4.2)
        c.text('MIDNIGHT  ×  CLOUDFLARE',84,731,28,MINT,start=5.2,bold=True)
        c.rect(1260,286,580,562,PANEL,.4)
        c.text('PRIVATE  →  PUBLIC',1294,320,27,MINT,.7,bold=True)
        c.grid(1295,401,52,12,start=2.2)
        c.text('24時間の判定',1297,628,46,start=4.4,bold=True)
        c.text('元の測定値は非公開',1297,707,29,MUTED,5.6)
        c.rect(80,836,1090,3,MINT,8,grow=1.1)
        c.text('測定',80,860,28,start=8)
        c.text('証明',575,860,28,MINT,9)
        c.text('検証',1075,860,28,MINT,10)
    elif sid=='problem':
        c.card(80,306,724,405,'MEASUREMENT OWNER','測定する側','機微な記録を保持\n結果の説明責任を果たす',.3)
        c.card(1116,306,724,405,'VERIFIER','確認する側','日付・条件・判定\n必要な根拠を確認する',4)
        c.arrow(826,1092,481,4.5)
        c.text('公開証拠',868,424,27,c.accent,4.5,bold=True)
        c.text('既存の機器  ＋  既存のクラウド',80,783,42,start=8.5,bold=True)
        c.text('建設現場の計測報告から、パートナー実証へ。',80,855,30,c.muted,12.7)
    elif sid=='scope':
        c.text('Walletを接続し、内容を確認・承認',80,283,44,MINT,.35,bold=True)
        names=['認証・登録','時間集計','ZK証明','承認・送信','第三者検証']
        bodies=['Walletで承認','非公開の日次入力','依頼と進行状態','Device + Sponsor','公開情報で照合']
        starts=[.6,7.8,9.25,11.4,13.7]
        for i,(name,body,t) in enumerate(zip(names,bodies,starts)):
            x=80+i*355
            c.rect(x,438,326,289,PANEL,.3+i*.1)
            c.text(f'{i+1:02}',x+24,465,64,MUTED,.4+i*.1,bold=True)
            c.text(name,x+24,567,36,start=t,bold=True)
            c.text(body,x+24,643,24,MUTED,t+.1)
            shade=MINT if i<2 or i==4 else VIOLET
            c.rect(x,724,326,4,shade,t,grow=.4)
            c.outline(x,438,326,289,shade,t,starts[i+1] if i<4 else 16.2,width=2)
            if i<4:
                c.arrow(x+327,x+352,590,t+.2)
        c.text('5つのUCを、ひと続きに。',80,815,53,MINT,16.2,bold=True)
    elif sid=='architecture':
        c.text('非公開データ',80,298,27,MINT,.3,bold=True)
        c.card(80,365,393,337,'EDGE / 計測元','元の測定列','生の記録は\n計測元に保持',.4)
        c.rect(536,279,888,537,PANEL,2)
        c.text('信頼する BACKEND',564,302,24,VIOLET,2,bold=True)
        c.card(567,365,366,193,'CLOUDFLARE','受付・Job管理','Workers / Queue / D1',2.5,VIOLET)
        c.card(998,365,394,193,'CONTAINER 01','Proof Server','非公開入力から証明生成',6.4,VIOLET)
        c.card(998,590,394,193,'CONTAINER 02','Sponsor Wallet','承認済み取引にDUST付加',8.9,AMBER)
        c.arrow(473,559,460,3.1)
        c.text('非公開入力',464,507,18,MUTED,3.1)
        c.arrow(933,991,460,6.5,fill=VIOLET)
        c.rect(748,558,3,132,AMBER,8.9)
        c.arrow(748,991,688,8.9,fill=AMBER)
        c.card(1490,365,350,337,'MIDNIGHT','公開証拠','取引・条件・判定\n第三者が照合',9.7)
        c.arrow(1392,1482,688,10.1)
        c.text('非公開の証明入力は、信頼するバックエンドで処理。',80,853,36,VIOLET,14.4,bold=True)
        c.text('生の測定列は計測元に残る',80,741,27,MINT,11.2)
    elif sid=='wallet':
        c.text('必要な処理があるときに起動',80,286,48,MINT,.3,bold=True)
        labels=['復元','同期','処理','保存','停止']
        bodies=['暗号化した状態','同期完了を待つ','Jobを1件ずつ','状態を暗号化','完了後に停止']
        times=[.5,4.7,7.1,9.6,11.1]
        for i,(label,body,t) in enumerate(zip(labels,bodies,times)):
            x=80+i*355
            c.rect(x,441,326,280,PANEL,.3)
            c.text(f'{i+1:02}',x+23,460,25,MUTED,.4,move=False)
            c.text(label,x+23,513,60,start=t,bold=True)
            c.text(body,x+23,626,26,MUTED,t)
            c.rect(x,716,326,5,[AMBER,MINT,VIOLET,AMBER,MINT][i],t,grow=.45)
            c.outline(x,441,326,280,[AMBER,MINT,VIOLET,AMBER,MINT][i],t,times[i+1] if i<4 else 13.1,width=2)
            if i<4:
                c.arrow(x+327,x+352,571,t+.3)
        c.text('02:00',80,770,83,MINT,13.1,bold=True)
        c.text('日次処理を開始する運用例',380,802,36,start=13.1)
        c.text('開始時刻と、取引の確定時刻は別です。',80,889,27,AMBER,17)
    elif sid=='boundary':
        c.card(80,317,846,380,'PROVEN RELATION','証明する関係','非公開の時間別入力\n× 登録された判定条件',.4)
        c.text('＋',958,457,69,c.muted,8,bold=True)
        c.card(1050,317,790,380,'SEPARATE ASSURANCE','別の保証が必要','センサーの物理的な正しさ\n測定の完全性・集約の正しさ',8,'976029')
        c.rect(80,774,1760,120,c.panel,16.3)
        c.text('現在の信頼境界',109,791,24,c.accent,16.3,bold=True)
        c.text('バックエンドと証明サービスを信頼する構成',109,829,36,start=16.3,bold=True)
    elif sid=='roadmap':
        c.text('次は、実業務で価値を確かめる。',80,291,66,MINT,.3,bold=True)
        for i,(title,body,t) in enumerate([('信頼性','日次検証を継続できるか',2.1),('支援工数','導入・運用の負担はどうか',4.4),('顧客価値','意思決定や業務に役立つか',6.3)]):
            c.card(80+i*601,426,558,261,f'EVALUATE 0{i+1}',title,body,t)
        c.text('対象業務  /  評価期間  /  検証指標を合意',80,743,37,start=9.3,bold=True)
        c.arrow(80,580,832,13.8)
        c.text('継続利用と商用提供の条件を検証',630,800,45,MINT,14.2,bold=True)
    else:
        raise ValueError(f'Unimplemented scene: {sid}')


TITLES = {
    'value':'確認できる証拠を、計測報告に。', 'problem':'共有するのは、必要な結果と根拠。',
    'scope':'登録から第三者検証まで。', 'device':'Deviceと判定条件を、先に結ぶ。',
    'day':'1日を、24の時間枠で扱う。', 'request':'受付から、証明生成と取引準備へ。',
    'confirmed':'Walletが承認。Sponsorが手数料を負担。', 'verify':'公開情報から、判定の根拠を確認。',
    'scenarios':'範囲外も、欠測も、そのまま残す。', 'managed':'管理APIで、既存の計測業務とつなぐ。',
    'operations':'サービス状態から、処理イベントまで。', 'architecture':'受付・証明・Walletを、役割ごとに。',
    'wallet':'Walletは、復元から停止までを管理。', 'boundary':'何を証明し、何を信頼するのか。',
    'roadmap':'パートナー実証へ。',
}


def prepare_scene(scene,index,story,cues,source,work):
    sid,duration=scene['id'],scene['duration']
    c=Canvas(duration,sid in ['problem','verify','boundary'])
    section=0 if index<2 else 1 if index<11 else 2 if index<14 else 3
    c.header(index+1,section,TITLES[sid])
    camera=gui_scene(c,sid,cues,duration) if sid in GUI else None
    if camera is None:
        authored_scene(c,sid,duration)
    all_captions=media.read_captions(source/'bacchiri-local-demo-ja.srt')
    captions=[(max(0,s-scene['start']),min(duration,e-scene['start']),t) for s,e,t in all_captions if s>=scene['start']-.015 and e<=scene['start']+duration+.015]
    if ''.join(t.replace('\n','') for s,e,t in captions) != scene['narration']:
        raise ValueError(f'Caption text differs: {sid}')
    ass=work/f'{sid}.ass'
    c.write(ass,captions)
    return c,ass,camera


def render_scene(scene,c,ass,camera,source,work,resume):
    sid,duration=scene['id'],scene['duration']
    destination=work/f'{sid}.mp4'
    signature=hashlib.sha256((sha256(Path(__file__))+sha256(ass)+json.dumps(camera)+json.dumps(scene)).encode()).hexdigest()
    receipt=work/f'{sid}.render.json'
    if resume and receipt.exists() and destination.exists():
        record=json.loads(receipt.read_text())
        if record.get('signature')==signature and record.get('sha256')==sha256(destination):
            print(json.dumps({'reused':sid}),flush=True)
            return
    command=['ffmpeg','-v','error','-y','-f','lavfi','-i',f'color=c=0x{c.background}:s=1920x1080:r=30:d={duration}']
    filters=''
    if camera:
        command+=['-i',source/'raw'/f'{sid}.mp4']
        z=f'1920/({camera_expression(camera,2)})'
        x,y=camera_expression(camera,0),camera_expression(camera,1)
        filters=(f"[1:v]fps=30,tpad=stop_mode=clone:stop_duration={duration},zoompan=z='{z}':x='{x}':y='{y}':d=1:s={SCREEN[2]}x{SCREEN[3]}:fps=30,setsar=1[gui];"
            f'[0:v][gui]overlay={SCREEN[0]}:{SCREEN[1]}:shortest=1[base];')
    else:
        filters='[0:v]null[base];'
    # Dark panel above the screen is drawn separately; ASS must not cover the actual clip.
    filters+=f'[base]ass={ass},fade=t=in:st=0:d=0.18,fade=t=out:st={duration-.14}:d=0.14[v]'
    graph=work/f'{sid}.ffmpeg.txt'
    graph.write_text(filters)
    run([*command,'-filter_complex_threads','1','-filter_complex_script',graph,'-map','[v]','-an','-frames:v',round(duration*30),
        '-c:v','libx264','-preset','veryfast','-crf','18','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',destination])
    receipt.write_text(json.dumps({'signature':signature,'sha256':sha256(destination),'frames':round(duration*30)})+'\n')
    print(json.dumps({'rendered':sid,'seconds':duration,'cameraStops':len(CAMERAS.get(sid,[]))}),flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir',type=Path,default=ROOT/'.demo-output/local-demo-wallet-uc-20260911')
    parser.add_argument('--output-dir',type=Path,default=ROOT/f'.demo-output/{EDITION}')
    parser.add_argument('--preview',action='append')
    parser.add_argument('--resume',action='store_true')
    args=parser.parse_args()
    source,output=args.source_dir.resolve(),args.output_dir.resolve()
    if source==output:
        raise ValueError('Keep the approved source movie intact')
    story=json.loads((HERE/'local-demo-story.json').read_text())
    edit=json.loads((source/'edit-manifest.json').read_text())
    plan=json.loads((HERE/'local-demo-focus.json').read_text())
    video=source/edit['video']
    if sha256(video)!=plan['sourceVideoSha256'] or sha256(source/'edit-manifest.json')!=plan['sourceEditSha256']:
        raise ValueError('Camera timing belongs to a different source edit')
    baseline.validate_capture(source,story['scenes'])
    focus.validate_plan(plan,edit)
    if edit['sourceStorySha256']!=sha256(HERE/'local-demo-story.json') or not edit['validation']['fullDecode']:
        raise ValueError('A validated matching narration story is required')
    if args.preview and not set(args.preview)<=set(TITLES):
        raise ValueError('Unknown preview scene')
    work=output/('previews' if args.preview else 'segments')
    work.mkdir(parents=True,exist_ok=True)
    cameras={}
    for index,scene in enumerate(edit['scenes']):
        if args.preview and scene['id'] not in args.preview:
            continue
        c,ass,camera=prepare_scene(scene,index,story,plan['scenes'][scene['id']],source,work)
        cameras[scene['id']]=camera
        render_scene(scene,c,ass,camera,source,work,args.resume)
        if args.preview:
            silent=work/f'{scene["id"]}.mp4'
            run(['ffmpeg','-v','error','-y','-i',silent,'-ss',scene['start'],'-i',video,'-map','0:v:0','-map','1:a:0',
                '-t',scene['duration'],'-c','copy','-movflags','+faststart',work/f'{scene["id"]}-with-audio.mp4'])
    if args.preview:
        return
    concat=work/'concat.txt'
    concat.write_text(''.join(f"file '{s['id']}.mp4'\n" for s in edit['scenes']))
    destination=output/'bacchiri-local-demo-ja.mp4'
    run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',concat,'-i',video,'-map','0:v:0','-map','1:a:0','-c','copy','-movflags','+faststart',destination])
    run(['ffmpeg','-v','error','-xerror','-i',destination,'-f','null','-'])
    info=probe(destination)
    seconds=float(info['format']['duration'])
    stream=next(s for s in info['streams'] if s['codec_type']=='video')
    if (stream['width'],stream['height'],stream['r_frame_rate'])!=(1920,1080,'30/1') or abs(seconds-edit['seconds'])>1/30:
        raise ValueError('Movie format or timeline changed')
    audio=focus.audio_hash(video)
    if focus.audio_hash(destination)!=audio:
        raise ValueError('Approved audio packets changed')
    for folder in ['frames','raw','narration']:
        shutil.copytree(source/folder,output/folder,dirs_exist_ok=True)
    for file in ['capture-evidence.json','bacchiri-local-demo-ja.srt','narration.md','story.json']:
        shutil.copy2(source/file,output/file)
    shutil.copy2(source/'edit-manifest.json',output/'baseline-edit-manifest.json')
    manifest=copy.deepcopy(edit)
    manifest.update({'edition':EDITION,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'seconds':seconds,'videoSha256':sha256(destination),
        'presentation':{'sourceVideoSha256':sha256(video),'sourceEditSha256':sha256(source/'edit-manifest.json'),
            'rendererSha256':sha256(Path(__file__)),'focusPlanSha256':sha256(HERE/'local-demo-focus.json'),
            'audioStreamSha256':audio,'cameraStops':sum(len(v) for v in CAMERAS.values()),'cameraKeys':cameras,
            'framing':'Original continuous GUI recording reframed with smooth camera movements; no speed change or action reorder.',
            'diagramDisclosure':'Authored explanatory diagrams, not new execution evidence.',
            'annotations':{s['id']:sha256(work/f'{s["id"]}.ass') for s in edit['scenes']}}})
    manifest['validation'].update({'fullDecode':True,'audioStreamUnchanged':True,'subtitlesUnchanged':sha256(source/'bacchiri-local-demo-ja.srt')==sha256(output/'bacchiri-local-demo-ja.srt'),'cameraBoundsValidated':True})
    (output/'edit-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'completed':str(destination),'seconds':seconds,'sha256':manifest['videoSha256']}),flush=True)


if __name__=='__main__':
    main()
