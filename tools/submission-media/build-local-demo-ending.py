#!/usr/bin/env python3
"""Append a narrated brand/slogan/thanks card to a validated local demo."""
import argparse
import copy
import datetime
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil
import textwrap

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
spec=importlib.util.spec_from_file_location('presentation_ending',HERE/'build-local-demo-presentation.py')
motion=importlib.util.module_from_spec(spec);spec.loader.exec_module(motion)
run,sha256,media=motion.run,motion.sha256,motion.media


def audio_bytes(file):
    return run(['ffmpeg','-v','error','-i',file,'-map','0:a:0','-c:a','copy','-f','adts','-']).stdout


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir',type=Path,default=ROOT/'.demo-output/local-demo-presentation-20260912')
    parser.add_argument('--output-dir',type=Path,default=ROOT/'.demo-output/local-demo-final-20260912')
    parser.add_argument('--locale',choices=['ja','en'],default='ja')
    parser.add_argument('--tts-python',type=Path,default=ROOT/'.demo-output/submission-en-20260831/.venv/bin/python')
    args=parser.parse_args();source,output=args.source_dir.resolve(),args.output_dir.resolve()
    if source==output:raise ValueError('Preserve the reviewed source movie')
    edit=json.loads((source/'edit-manifest.json').read_text());video=source/edit['video']
    if sha256(video)!=edit['videoSha256'] or not edit['validation']['fullDecode']:raise ValueError('Validated source movie required')
    ending_path=HERE/'local-demo-ending.json';ending=json.loads(ending_path.read_text());copytext=ending[args.locale]
    voice=ending['voice'] if args.locale=='ja' else ending['enVoice']
    output.mkdir(parents=True,exist_ok=True)
    speech=motion.module('ending_pronunciation', 'local-demo-speech.py')
    spoken=(speech.audio_for({'id':'closing','ja':copytext},output,args.tts_python.absolute(),voice,False,motion.baseline)
        if args.locale=='en' else motion.baseline.audio_for({'id':'closing','ja':copytext},output,args.tts_python.absolute(),voice,False))
    if args.locale == 'en':
        raw = media.read_captions(output / 'narration/closing.srt')
        spoken['cues'] = [(s, min(e, raw[i+1][0]) if i+1 < len(raw) else e, textwrap.fill(t, width=88, break_long_words=False, break_on_hyphens=False)) for i, (s, e, t) in enumerate(raw)]
        if ' '.join(' '.join(t.split()) for s, e, t in spoken['cues']) != copytext['narration']:
            raise ValueError('English closing captions differ')
    duration=math.ceil((spoken['duration']+1.4)*30)/30
    c=motion.Canvas(duration)
    c.text(copytext['title'],960,302,146,motion.MINT,.15,bold=True,align=5)
    c.text(copytext['reading'],960,406,32,motion.MUTED,.35,align=5)
    slogan_start=spoken['cues'][1][0] if len(spoken['cues'])>1 else 1.5
    thanks_start=spoken['cues'][-1][0]
    c.rect(750,466,420,3,motion.MINT,slogan_start,grow=.65)
    c.text(copytext['slogan'],960,594,82 if args.locale=='ja' else 86,motion.WHITE,slogan_start,bold=True,align=5)
    c.text(copytext['thanks'],960,800,57,motion.MINT,thanks_start,bold=True,align=5)
    ass=output/'closing.ass';c.write(ass,spoken['cues'])
    clip=output/'closing.mp4'
    run(['ffmpeg','-v','error','-y','-f','lavfi','-i',f'color=c=0x{motion.BG}:s=1920x1080:r=30:d={duration}',
        '-i',spoken['audio'],'-filter_complex',f'[0:v]ass={ass},fade=t=in:st=0:d=0.25,fade=t=out:st={duration-.5}:d=0.5[v];[1:a]loudnorm=I=-17:TP=-1.5:LRA=8,aresample=48000,apad,atrim=duration={duration}[a]',
        '-map','[v]','-map','[a]','-t',duration,'-c:v','libx264','-preset','veryfast','-crf','18','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-ac','1','-movflags','+faststart',clip])
    listing=output/'append.txt';listing.write_text(f"file '{video}'\nfile '{clip}'\n")
    destination=output/f'bacchiri-local-demo-{args.locale}.mp4'
    run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',listing,'-c','copy','-movflags','+faststart',destination])
    run(['ffmpeg','-v','error','-xerror','-i',destination,'-f','null','-'])
    original_audio=audio_bytes(video);final_audio=audio_bytes(destination)
    if not final_audio.startswith(original_audio):raise ValueError('The original narration packets changed')
    metadata=media.probe(destination)
    v=next(s for s in metadata['streams'] if s['codec_type']=='video')
    if (v['width'],v['height'],v['r_frame_rate'])!=(1920,1080,'30/1'):raise ValueError('Unexpected movie format')
    for directory in ['frames','raw','narration','pronunciation-source']:
        if (source/directory).exists():shutil.copytree(source/directory,output/directory,dirs_exist_ok=True)
    for name in ['capture-evidence.json','story.json','presentation-contact-sheet.png','presentation-review-samples.json','camera-review-samples.json']:
        if (source/name).exists():shutil.copy2(source/name,output/name)
    shutil.copy2(source/'edit-manifest.json',output/'source-edit-manifest.json')
    shutil.copy2(ending_path,output/'ending.json')
    start=media.duration(video)
    source_srt=source/f'bacchiri-local-demo-{args.locale}.srt';old=media.read_captions(source_srt)
    joined=old+[(s+start,e+start,t) for s,e,t in spoken['cues']]
    media.write_captions(output/f'bacchiri-local-demo-{args.locale}.srt',joined)
    # The main captions are byte-for-byte the same prefix, including cue numbering.
    if not (output/f'bacchiri-local-demo-{args.locale}.srt').read_bytes().startswith(source_srt.read_bytes().rstrip()+b'\n\n'):
        raise ValueError('Main caption timing changed')
    record={'id':'closing','start':start,'duration':duration,'narration':copytext['narration'],'voice':voice,'audioSha256':sha256(spoken['audio']),'simulated':True,'placeholder':False}
    manifest=copy.deepcopy(edit)
    manifest.update({'edition':output.name,'language':args.locale,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'video':destination.name,'videoSha256':sha256(destination),'seconds':media.duration(destination),'scenes':edit['scenes']+[record],
        'ending':{'file':'ending.json','sha256':sha256(ending_path),'sourceVideo':str(video.relative_to(ROOT)),'sourceVideoSha256':sha256(video),'sourceEditSha256':sha256(source/'edit-manifest.json'),'sourceAudioSha256':hashlib.sha256(original_audio).hexdigest(),'start':start,'duration':duration,'narration':copytext['narration'],'annotationsSha256':sha256(ass)}})
    manifest['validation'].update({'fullDecode':True,'captionTextMatchesNarration':True,'mainAudioPacketsUnchanged':True,'mainCaptionsUnchanged':True,'audioStreamUnchanged':False,'subtitlesUnchanged':False,'endingNarrationAdded':True})
    (output/'edit-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    (output/'narration.md').write_text((source/'narration.md').read_text()+f'\n\n## Closing ({start:.2f}s)\n\n{copytext["narration"]}\n')
    run(['ffmpeg','-v','error','-y','-ss',thanks_start+.7,'-i',clip,'-frames:v','1',output/'closing-poster.png'])
    print(json.dumps({'completed':str(destination),'seconds':manifest['seconds'],'endingSeconds':duration,'mainAudioPreserved':True}),flush=True)


if __name__=='__main__':main()
