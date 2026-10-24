"""홍보 영상 배경음(합성). 영상 구간에 맞춰 패드 · 베이스 · 킥 · 하이햇 · 아르페지오 · 라이저를 쌓는다.
사용: python3 promo/music.py <출력.wav> [full|teaser]
96BPM, 코드 진행 Am9 → Fmaj7 → Cmaj9 → G6(코드마다 2마디 = 5초).
구간(초)은 영상 편집에 맞춘다: full = 본편 5분 4초, teaser = 2분 11초 줄임본.
"""
import sys
import wave

import numpy as np

SR = 48000
OUT = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
CUT = sys.argv[2] if len(sys.argv) > 2 else 'full'
# 관제 화면, 거점 소개, 계절, 여정(해상·항공), AI, 엔딩, 끝
SEC = {
    'full': dict(dash=14, tour=30, seasons=150, trips=195, ai=268, fin=290, end=304),
    'teaser': dict(dash=14, tour=22, seasons=55, trips=75, ai=105, fin=117, end=131),
}[CUT]
DUR = float(SEC['end'])
N = int(SR * DUR)
t = np.arange(N) / SR
L = np.zeros(N)
R = np.zeros(N)
BEAT = 60 / 96
BAR = BEAT * 4
CHORD = BAR * 2

D, T, SE, TR, A, F = SEC['dash'], SEC['tour'], SEC['seasons'], SEC['trips'], SEC['ai'], SEC['fin']


def env(points):
    """(시각, 값) 꺾은선 → 전체 길이 배열"""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return np.interp(t, xs, ys)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


CHORDS = [
    [45, 52, 60, 67, 71],  # Am9: A2 E3 C4 G4 B4
    [41, 48, 57, 64, 67],  # Fmaj7: F2 C3 A3 E4 G4
    [48, 55, 64, 71, 74],  # Cmaj9: C3 G3 E4 B4 D5
    [43, 50, 59, 64, 69],  # G6add9: G2 D3 B3 E4 A4
]


def add(buf_l, buf_r, start, sig, pan=0.0):
    i0 = int(start * SR)
    if i0 >= N:
        return
    n = min(len(sig), N - i0)
    if i0 < 0:
        sig = sig[-i0:]
        n = min(len(sig), N)
        i0 = 0
    gl = np.sqrt(0.5 * (1 - pan))
    gr = np.sqrt(0.5 * (1 + pan))
    buf_l[i0:i0 + n] += sig[:n] * gl
    buf_r[i0:i0 + n] += sig[:n] * gr


# ── 패드: 코드음마다 살짝 어긋난 두 음(좌우)과 배음, 느린 어택·릴리스
pad_l = np.zeros(N)
pad_r = np.zeros(N)
k = 0
start = 0.0
while start < DUR:
    notes = CHORDS[k % 4]
    dur = CHORD + 2.2
    tt = np.arange(int(dur * SR)) / SR
    a = np.clip(tt / 1.8, 0, 1) * np.clip((dur - tt) / 2.2, 0, 1)
    a = a * a * (3 - 2 * a)
    for m in notes:
        f = hz(m)
        for det, pan in ((-0.0025, -0.6), (0.0025, 0.6)):
            ff = f * (1 + det)
            s = np.sin(2 * np.pi * ff * tt) + 0.28 * np.sin(2 * np.pi * 2 * ff * tt + 0.7) + 0.1 * np.sin(2 * np.pi * 3 * ff * tt + 1.3)
            # 천천히 숨 쉬는 떨림
            s *= 1 + 0.08 * np.sin(2 * np.pi * 0.21 * tt + m)
            add(pad_l, pad_r, start, s * a * (0.075 if m < 50 else 0.06), pan)
    start += CHORD
    k += 1
g = env([(0, 0), (3.5, 0.75), (9.0, 0.95), (D, 0.8), (SE, 0.85), (TR, 0.75), (F, 0.95), (DUR - 5, 0.9), (DUR, 0)])
L += pad_l * g
R += pad_r * g

# ── 베이스: 마디의 1·3박에 근음(뜯는 소리)
bass = np.zeros(N)
beat = 0
while beat * BEAT < DUR:
    if beat % 2 == 0:
        st = beat * BEAT
        root = CHORDS[int(st // CHORD) % 4][0]
        f = hz(root if root < 45 else root - 12)
        tt = np.arange(int(1.1 * SR)) / SR
        s = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * 2 * f * tt)) * np.exp(-tt * 3.2) * np.clip(tt / 0.01, 0, 1)
        i0 = int(st * SR)
        n = min(len(s), N - i0)
        bass[i0:i0 + n] += s[:n]
    beat += 1
g = env([(0, 0), (D - 0.5, 0), (D + 1.5, 0.55), (SE, 0.5), (TR, 0.6), (F, 0.55), (F + 2, 0), (DUR, 0)])
L += bass * g * 0.42
R += bass * g * 0.42

# ── 킥: 박마다 낮게 떨어지는 사인
kick = np.zeros(N)
tt = np.arange(int(0.42 * SR)) / SR
phase = 2 * np.pi * np.cumsum(48 + 72 * np.exp(-tt * 28)) / SR
ks = np.sin(phase) * np.exp(-tt * 8.5)
beat = 0
while beat * BEAT < DUR:
    i0 = int(beat * BEAT * SR)
    n = min(len(ks), N - i0)
    kick[i0:i0 + n] += ks[:n]
    beat += 1
g = env([(0, 0), (T - 0.5, 0), (T + 1, 0.5), (SE - 1, 0.5), (SE + 1, 0.22), (TR - 1, 0.22), (TR + 1, 0.6), (A - 1, 0.6), (A + 1, 0.42), (F - 1, 0.42), (F, 0), (DUR, 0)])
L += kick * g * 0.44
R += kick * g * 0.44

# ── 하이햇: 엇박에 짧은 고음 잡음
rng = np.random.default_rng(7)
hat = np.zeros(N)
hn = int(0.06 * SR)
beat = 0
while beat * BEAT < DUR:
    st = beat * BEAT + BEAT / 2
    i0 = int(st * SR)
    noise = rng.standard_normal(hn)
    noise = np.diff(noise, prepend=0)  # 고역 위주
    s = noise * np.exp(-np.arange(hn) / SR * 70)
    n = min(hn, N - i0)
    if n > 0:
        hat[i0:i0 + n] += s[:n]
    beat += 1
g = env([(0, 0), (TR - 1, 0), (TR + 1, 0.14), (A - 1, 0.14), (A + 1, 0.09), (F - 1, 0.09), (F, 0), (DUR, 0)])
L += hat * g * 0.5
R += hat * g * 0.5

# ── 아르페지오: 8분음표로 코드음을 위 옥타브에서 오르내린다(좌우로 번갈아)
arp_l = np.zeros(N)
arp_r = np.zeros(N)
step = BEAT / 2
i = 0
tt = np.arange(int(0.6 * SR)) / SR
while i * step < DUR:
    st = i * step
    notes = CHORDS[int(st // CHORD) % 4]
    seq = [notes[1] + 12, notes[2] + 12, notes[3] + 12, notes[4] + 12, notes[3] + 12, notes[2] + 12]
    f = hz(seq[i % len(seq)])
    s = (np.sin(2 * np.pi * f * tt) + 0.18 * np.sin(2 * np.pi * 3 * f * tt)) * np.exp(-tt * 6.5) * np.clip(tt / 0.004, 0, 1)
    add(arp_l, arp_r, st, s * 0.11, -0.45 if i % 2 else 0.45)
    i += 1
g = env([(0, 0), (SE - 1, 0), (SE + 2, 0.9), (TR - 1, 0.9), (TR + 1, 0.7), (F - 1, 0.7), (F + 1, 1.0), (DUR - 4, 0.8), (DUR, 0)])
L += arp_l * g
R += arp_r * g

# ── 라이저(제목 직전·엔딩 직전)와 충격음
def riser(end, length=3.0, amp=0.18):
    n = int(length * SR)
    x = np.arange(n) / SR
    sweep = np.sin(2 * np.pi * np.cumsum(180 + 900 * (x / length) ** 2) / SR)
    noise = np.diff(rng.standard_normal(n), prepend=0) * 0.5
    s = (sweep * 0.5 + noise) * (x / length) ** 2 * amp
    add(L, R, end - length, s, -0.2)
    add(L, R, end - length, s, 0.2)


def impact(at, amp=0.55):
    n = int(2.4 * SR)
    x = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(36 + 60 * np.exp(-x * 9)) / SR
    s = np.sin(ph) * np.exp(-x * 2.2) * amp
    add(L, R, at, s, -0.1)
    add(L, R, at, s, 0.1)


riser(9.2)
impact(9.2)
riser(float(F), 2.6, 0.14)
impact(float(F), 0.45)

# ── 마무리: 정규화, 끝 페이드
fade = env([(0, 0), (0.8, 1), (DUR - 2.5, 1), (DUR, 0)])
L *= fade
R *= fade
peak = max(np.abs(L).max(), np.abs(R).max())
L = L / peak * 0.89
R = R / peak * 0.89
pcm = np.empty(N * 2, dtype=np.int16)
pcm[0::2] = (L * 32767).astype(np.int16)
pcm[1::2] = (R * 32767).astype(np.int16)
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote', OUT, f'{DUR:.1f}s')
