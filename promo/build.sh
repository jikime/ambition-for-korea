#!/bin/sh
# 장면 영상(promo/out/scenes)을 이어 붙이고 음악을 입혀 X 업로드용 MP4를 만든다.
#  hubtrace-promo.mp4         본편 5분 4초(음악)
#  hubtrace-promo-silent.mp4  본편 무음
#  hubtrace-teaser.mp4        2분 11초 줄임본(X 일반 계정 업로드 한도 2분 20초 안)
#  hubtrace-poster.jpg        제목 장면 이미지
# 사용: sh promo/build.sh  (먼저 promo/music.py로 out/music.wav, out/music-teaser.wav를 만든다)
set -e
cd "$(dirname "$0")/out"
ls scenes/*.mp4 | sort | sed "s/^/file '/; s/$/'/" > scenes.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i scenes.txt -c copy video-raw.mp4
# 캡처(JPEG)는 BT.601 전범위 색이라, 웹 표준인 BT.709 제한 범위로 바꾸고 색 정보를 붙인다
COLOR="scale=in_range=full:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709,format=yuv420p"
ENC="-c:v libx264 -preset slow -crf 19 -maxrate 12M -bufsize 24M -profile:v high -level 4.1 -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -r 30 -g 60 -movflags +faststart"
ffmpeg -y -loglevel error -i video-raw.mp4 -i music.wav -map 0:v -map 1:a -vf "$COLOR" $ENC -c:a aac -b:a 192k -ar 48000 -shortest hubtrace-promo.mp4
ffmpeg -y -loglevel error -i video-raw.mp4 -map 0:v -vf "$COLOR" $ENC -an hubtrace-promo-silent.mp4

# 줄임본: (시작, 끝) 초. 오프닝 · 관제 화면 · 거점 6곳 · 계절 4개 · 해상 · 항공 · AI · 엔딩
SEGS="0:14 14:22 30.6:36.1 60.6:66.1 80.6:86.1 90.6:96.1 120.6:126.1 140.6:146.1 151.5:156.5 161.5:166.5 172:177 182:187 195.6:203.1 216:223.5 248:253 255:265 274:286 290:304"
F=""
C=""
i=0
for s in $SEGS; do
  a=${s%:*}; b=${s#*:}
  F="$F[0:v]trim=start=$a:end=$b,setpts=PTS-STARTPTS[v$i];"
  C="$C[v$i]"
  i=$((i+1))
done
ffmpeg -y -loglevel error -i video-raw.mp4 -i music-teaser.wav -filter_complex "${F}${C}concat=n=$i:v=1:a=0[c];[c]${COLOR}[v]" -map "[v]" -map 1:a $ENC -c:a aac -b:a 192k -ar 48000 -shortest hubtrace-teaser.mp4

ffmpeg -y -loglevel error -ss 12.4 -i video-raw.mp4 -frames:v 1 -q:v 2 hubtrace-poster.jpg
for f in hubtrace-promo.mp4 hubtrace-promo-silent.mp4 hubtrace-teaser.mp4; do
  printf '%s  %s초  %sMB\n' "$f" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" | cut -d. -f1)" "$(($(stat -f%z "$f") / 1048576))"
done
