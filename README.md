# OCR 주기장 검색 (ocr2)

표 이미지를 카메라/갤러리로 불러와 **편명 · 주기장 · R/O L/D 이름**을 OCR로 추출하고 검색하는 PWA입니다.

## 주요 기능

- 카메라 촬영 / 갤러리 선택
- 헤더 자동 인식 + 고정 컬럼 보정
- 편명 / 주기장 / 이름 추출
- 이름·원문 검색, 결과 복사, CSV 다운로드
- 홈 화면 추가(PWA) 지원

## 사용 방법

1. [배포 URL](https://ocr2-psi.vercel.app) 접속 (또는 Vercel 배포 주소)
2. 표 사진 선택 후 **OCR 실행**
3. 필요 시 검색어로 필터링 → 복사 / CSV

## 로컬 실행

정적 파일이므로 아무 HTTP 서버로 열면 됩니다.

```bash
npx serve .
```

## 기술

- Tesseract.js (브라우저 OCR)
- Service Worker + Web App Manifest
