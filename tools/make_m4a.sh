#!/bin/sh
# AAC copies of audio/*.ogg for the iOS build (iOS before 18.4 does not decode Ogg Vorbis).
# Run after adding or changing a sound; the result, audio-m4a/, is committed.
set -e
cd "$(dirname "$0")/.."
mkdir -p audio-m4a
for f in audio/*.ogg; do
  n=$(basename "$f" .ogg)
  case $n in music-*) br=128k ;; *) br=96k ;; esac
  ffmpeg -v error -y -i "$f" -vn -c:a aac -b:a $br -movflags +faststart "audio-m4a/$n.m4a"
done
