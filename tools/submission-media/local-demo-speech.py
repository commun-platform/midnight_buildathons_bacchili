"""Explicit spoken names with canonical English captions and separate TTS cache."""
import copy
import json
from pathlib import Path
import re
import shutil

DICTIONARY = Path(__file__).with_name('local-demo-pronunciation.json')
PRONUNCIATIONS = json.loads(DICTIONARY.read_text())


def cache_spec(narration, voice):
    expected = {'text': narration, 'voice': voice, 'rate': '+0%'}
    names = {written: spoken for written, spoken in PRONUNCIATIONS.items() if written in narration}
    if names:
        text = narration
        for written, spoken in names.items():
            text = text.replace(written, spoken)
        expected.update({'synthesisText': text, 'pronunciations': names})
    return expected


def audio_for(scene, output, python, voice, reuse, backend):
    narration = scene['ja']['narration']
    expected = cache_spec(narration, voice)
    if 'synthesisText' not in expected:
        return backend.audio_for(scene, output, python, voice, reuse)
    # Keep the original synthesizer subtitles as evidence of what was spoken.
    synthesis_scene = copy.deepcopy(scene)
    synthesis_scene['ja']['narration'] = expected['synthesisText']
    synthesis_output = output / 'pronunciation-source'
    spoken = backend.audio_for(synthesis_scene, synthesis_output, python, voice, reuse)
    base = output / 'narration' / scene['id']
    base.parent.mkdir(parents=True, exist_ok=True)
    raw = backend.media.read_captions(synthesis_output / 'narration' / f'{scene["id"]}.srt')
    captions = []
    for start, end, text in raw:
        for written, name in expected['pronunciations'].items():
            text = text.replace(name, written)
        captions.append((start, end, text))
    normalize = lambda text: re.sub(r'\s+', '', text)
    if normalize(''.join(t for s, e, t in captions)) != normalize(narration):
        raise ValueError(f'Pronunciation mapping changed caption content: {scene["id"]}')
    shutil.copy2(spoken['audio'], base.with_suffix('.mp3'))
    backend.media.write_captions(base.with_suffix('.srt'), captions)
    base.with_suffix('.txt').write_text(narration + '\n')
    base.with_suffix('.json').write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n')
    return {'audio': base.with_suffix('.mp3'), 'cues': captions, 'duration': spoken['duration']}
