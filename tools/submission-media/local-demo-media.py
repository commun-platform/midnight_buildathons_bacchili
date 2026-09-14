"""Shared media helpers for the retained local-demo edition."""
import hashlib
import html
import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def run(args, cwd=ROOT):
    subprocess.run([str(value) for value in args], cwd=cwd, check=True)


def probe(file):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries',
        'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels',
        '-of', 'json', str(file),
    ]))


def duration(file):
    return float(probe(file)['format']['duration'])


def timestamp(value):
    total = round(value * 1000)
    hours, rest = divmod(total, 3600000)
    minutes, rest = divmod(rest, 60000)
    seconds, milliseconds = divmod(rest, 1000)
    return f'{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}'


def seconds(value):
    hours, minutes, whole, milliseconds = map(int, re.split('[:,]', value))
    return hours * 3600 + minutes * 60 + whole + milliseconds / 1000


def read_captions(file):
    pattern = r'\d+\s*\n(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})\s*\n(.+?)(?=\n\s*\n|\Z)'
    return [(seconds(start), seconds(end), html.unescape(text.strip()))
            for start, end, text in re.findall(pattern, file.read_text(), re.S)]


def write_captions(file, cues):
    file.write_text('\n\n'.join(
        f'{index}\n{timestamp(start)} --> {timestamp(end)}\n{text}'
        for index, (start, end, text) in enumerate(cues, 1)
    ) + '\n', encoding='utf-8')


def write_ass(file, cues, font):
    def ass_time(value):
        centiseconds = round(value * 100)
        hours, rest = divmod(centiseconds, 360000)
        minutes, rest = divmod(rest, 6000)
        whole_seconds, fraction = divmod(rest, 100)
        return f'{hours}:{minutes:02}:{whole_seconds:02}.{fraction:02}'

    header = (
        '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2\n'
        '[V4+ Styles]\n'
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
        f'Style: Default,{font},40,&H00FFFFFF,&H00FFFFFF,&H001F1106,&H001F1106,0,0,0,0,100,100,0,0,3,1,0,2,96,96,20,1\n'
        '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
    )
    lines = []
    for start, end, text in cues:
        escaped = text.replace('\\', '\\\\').replace('{', '\\{').replace('}', '\\}').replace('\n', '\\N')
        lines.append(f'Dialogue: 0,{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{escaped}')
    file.write_text(header + '\n'.join(lines) + '\n')


def sha256(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()
