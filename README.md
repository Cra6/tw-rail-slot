# 🎰 台灣軌道拉霸機

選一個軌道系統,拉一把老虎機,隨機抽出 **一條路線 → 一個車站 → 一個小任務**。純好玩、給自己用的小網頁,資料離線內建,可直接上 GitHub Pages。

收錄系統:🚆 台鐵、🚇 雙北捷運(台北捷運 + 淡海/安坑輕軌)、🚈 台中捷運、🚋 高雄捷運、✈️ 桃園捷運。

## 玩法

1. 在選擇畫面點一個系統。
2. (可選)用上方「路線範圍」鎖定某一條線,或維持「🎲 隨機路線」整個系統一起抽。
3. 拉右邊的拉桿、或按 **🎰 拉霸!** —— 三輪會依序停下:路線 → 車站 → 任務。
4. 看結果:站名(中/英)、路線、站號、🗺 Google Maps 連結,以及一個趣味任務。
5. 「再抽一次」繼續玩;抽過的都會記在下方「📜 抽站紀錄」(存在瀏覽器本機)。

## 本機開啟

- **最簡單**:直接用瀏覽器打開 `index.html` 即可(資料是 `data/stations.js`,以 `<script>` 載入,不用伺服器)。
- **或開本機伺服器**(任一):
  ```bash
  npx serve -l 8123 .
  # 或 python -m http.server 8123
  ```
  然後瀏覽 http://localhost:8123 。

## 上 GitHub Pages

> 註:免費 GitHub 帳號的 Pages 只能用在**公開 repo**(把 repo 設成 private 會讓 Pages 自動下架)。程式碼會公開,但這只是個小玩具沒關係;不想被看到就單純別公布網址。真正私人的網站要 GitHub Enterprise,自己玩可不必。

1. 建一個 repo,把這個資料夾的內容 push 上去:
   ```bash
   git init
   git add .
   git commit -m "台灣軌道拉霸機"
   git branch -M main
   git remote add origin https://github.com/<你的帳號>/<repo>.git
   git push -u origin main
   ```
2. GitHub repo → **Settings → Pages** → Source 選 `main` 分支、資料夾 `/ (root)` → Save。
3. 等一會兒,網址會是 `https://<你的帳號>.github.io/<repo>/`。

## 檔案結構

```
station/
├─ index.html        # 兩個畫面:選擇 + 拉霸機
├─ style.css         # 復古街機外觀、滾輪、RWD
├─ app.js            # 畫面切換、三輪依序停動畫、抽選、音效、歷史
└─ data/stations.js  # 站點資料(window.STATION_DATA)
```

## 想自己改

- **加/改趣味任務**:編輯 `app.js` 最上面的 `TASKS` 陣列。每個任務是 `{ t: "任務文字", sys: "all" }`;`sys` 可填 `all`(各系統都抽得到)、`metro`(只給捷運/輕軌)、`tra`(只給台鐵)。抽任務時會自動依目前系統過濾。
- **改站點/路線/顏色**:編輯 `data/stations.js`。每一站的格式:
  ```js
  { zh: "西門", en: "Ximen", code: "BL11", seq: 11, mapQuery: "西門站" }
  ```
  - `code` 捷運填站號,台鐵填 `null`。
  - `mapQuery` 是 Google Maps 搜尋字串(台鐵用「○○車站」、捷運/輕軌用「○○站」)。
  - 每條線的 `color` 是該路線官方代表色(也用來當結果底色)。
- **調滾輪格高**:`style.css` 裡的 `--item-h`。

## 資料來源

站點清單以 **TDX 運輸資料流通服務平臺** 開放資料與各營運單位官方路網圖整理而成,僅收錄目前營運中的車站(施工中、未通車者不列入)。資料為靜態快照,路網有更新時請自行同步 `data/stations.js`。
