# YouTube Capture Helper

Windows와 macOS에서 백그라운드로 실행되며 [YouTube Capture](https://youtube-frame-capture.vercel.app)의 영상 처리를 로컬에서 담당합니다.

## 다운로드

[Releases](../../releases/latest)에서 운영체제에 맞는 설치 파일을 받으세요.

> 첫 버전은 코드 서명이 없는 미리보기 버전입니다. Windows SmartScreen 또는 macOS Gatekeeper 경고가 표시될 수 있습니다.

## 동작 방식

- `127.0.0.1:43117`에서 로컬 처리 API 실행
- 허용된 YouTube Capture 사이트에서만 브라우저 요청 수락
- yt-dlp와 FFmpeg는 사용자 PC에서 실행
- 임시 영상과 캡처는 요청 종료 후 삭제
