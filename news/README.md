# 여행 소식지 (news/)

[떠나기] 탭에 나오는 **이번 달 축제·갈 만한 곳** 자료입니다.

## 어떻게 만들어지나

```
매달 2일 새벽  →  GitHub Actions 가 한국관광공사 TourAPI 를 불러
                 news/2026-10.json  과  news/latest.json  을 만들어 올립니다
```

앱은 **API 를 직접 부르지 않고** 이 파일만 읽습니다. 그래서

- 인증키가 공개 저장소에 들어가지 않습니다 (저장소 Secret 에만 있음)
- 하루 1,000건 호출 한도를 앱 사용자가 쓰지 않습니다
- 소식지 파일이 없어도 앱은 정상 동작합니다 ("아직 소식지가 없어요" 안내)

## 지금 바로 만들고 싶을 때

GitHub 저장소 → **Actions** 탭 → 왼쪽 **여행 소식지 만들기** → 오른쪽 **Run workflow**
(달을 비워 두면 이번 달, `2026-11` 처럼 적으면 그 달)

## 처음 한 번만 — 인증키 넣기

저장소 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| 항목 | 값 |
|---|---|
| Name | `TOUR_API_KEY` |
| Secret | 공공데이터포털에서 받은 **일반 인증키(Decoding)** |

> 키는 이 화면에 넣은 뒤 다시 볼 수 없고, 코드·파일 어디에도 남지 않습니다.

## 파일 안에 무엇이 있나

| 항목 | 설명 |
|---|---|
| `title` / `lead` | 이달의 머리글 (지어낸 사실 없음, 분위기 문구만) |
| `festivals[]` | 이번 달에 열리는 축제 — 이름·기간·지역·주소·전화·사진·좌표 |
| `spots{지역}` | 지역별 갈 만한 곳 4곳 |
| `source` | 한국관광공사 TourAPI |

## 저작권

사진·정보는 **한국관광공사** 제공입니다. 화면에 출처를 표시하고 있으며, 사진에 색 보정·합성을 하지 않습니다.
(`rights` 값이 `Type3` 인 사진은 **변경 금지** 조건입니다)

## 손으로 만들기 (Actions 를 안 쓸 때)

```bash
TOUR_API_KEY="발급받은키" node tools/make-news.mjs
```

## 2026-09-29 추가 항목
- spots 각 장소: `hours`(이용시간) `closed`(쉬는 날) `parking` `tel`(문의) `menu`(맛집 대표메뉴) `pet`/`petText` `stroller`/`strollerText` `images[]`(최대 4장, 관광지만)
  — detailIntro2·detailImage2. 없으면 빈 값. 생성기는 지난 파일에 있는 값을 재사용해 호출을 아낀다.
- `courses{지역}`: 관광공사 여행코스(contentTypeId 25) 최대 3개 — `title` `intro` `distance` `taketime` `img` `spots[{name,intro}]`(detailInfo2).
  앱은 spots 가 비어 있는 코스는 보여 주지 않는다.

## spots 항목의 `intro` (2026-09-16 추가)
장소마다 한 줄 소개. 관광공사 detailCommon2 의 overview 첫 문장(HTML 제거, 140자 이내). 없으면 빈 문자열 — 앱은 그럴 때 소개 줄을 아예 안 그린다.
`contentTypeId` 는 12 관광지 · 14 문화시설 · 28 레포츠 · 39 맛집만 모은다(38 쇼핑·32 숙박·25 코스 제외).
