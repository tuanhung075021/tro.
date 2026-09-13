# Changelog

Tất cả những thay đổi đáng chú ý của dự án **tro.** sẽ được ghi chép trong tài liệu này.

Định dạng tài liệu dựa trên [Keep a Changelog](https://keepachangelog.com/vi/1.0.0/), và dự án này tuân thủ theo [Semantic Versioning](https://semver.org/lang/vi/).

---

## [Unreleased]

### Changed
- refactor: Cập nhật định danh thương hiệu hệ thống thành **tro.**

### Added
- ci: Thiết lập GitHub Actions tự động kiểm tra License Compliance và Unit Tests trên mỗi commit.

## [1.0.0] - 2026-09-13

### Added
- **Cơ chế Cấu hình số người định mức xác thực kép (Dual-Approval Occupancy Change)**:
  - Thay thế nút "Báo sai định mức" bằng quy trình đề xuất và phê duyệt chéo giữa Người thuê và Chủ trọ.
  - Bắt buộc nhập mật khẩu tài khoản cá nhân để ký số đề xuất (`password verification`), ngăn chặn tự duyệt trái phép.
  - Lưu vết lịch sử biến động định mức trong bảng `RoomOccupancyLog`.
- **Giải bài toán thay đổi số người giữa tháng theo Thông tư 60/2025/TT-BCT (Prorated)**:
  - Tự động phân bổ định mức theo tỷ lệ số ngày thực tế trong chu kỳ hóa đơn khi có người chuyển vào/chuyển đi.
  - Chi tiết phân bổ theo từng khoảng thời gian hiển thị minh bạch trong `breakdown_data["electricity"]["occupancy_prorated"]`.
- **Quản lý Xóa phòng & Xóa khu trọ an toàn cho Chủ trọ**:
  - Ràng buộc an toàn: Phòng phải trống (`vacant`) và khu trọ không còn khách thuê mới được phép xóa.
  - Bắt buộc xác thực mật khẩu chủ trọ trước khi thực thi xóa, tránh thất thoát dữ liệu.
- **Hệ thống Quản trị & Biểu giá nhà nước tập trung**:
  - Cơ chế Easter Egg đăng ký Root Admin qua cú pháp bảo mật `username::secret_key`.
  - Phân quyền 5 cấp: `root_admin`, `admin`, `pending_admin`, `landlord`, `tenant`.
  - Quản lý và cập nhật biểu giá 6 bậc điện QĐ 1279, ghi nhận nhật ký `TariffChangeLog`, hỗ trợ xoay vòng Secret Key.
- **Hệ thống Realtime WebSocket & In-App Notification trung tâm**:
  - Tích hợp `WebSocketManager` phát sóng tức thời các sự kiện hóa đơn, định mức, biểu giá.
  - Trung tâm thông báo chuông Navbar hỗ trợ đầy đủ các trạng thái `pending`, `approved`, `rejected` (kèm lý do từ chối).
  - Tự động điều hướng, cuộn mượt và highlight card phòng 4 giây khi bấm vào thông báo.
- **Đại tu toàn diện Giao diện Mobile-First Responsive**:
  - Chuyển hơn 13 modal trên hệ thống sang chuẩn **Mobile Bottom Sheet** (trượt từ đáy, bo góc `rounded-t-3xl`, drag handle bar, `max-h-[92vh]`).
  - Tiết chế padding/margin thừa, căn chỉnh dropdown thông báo chống tràn ngang (no horizontal overflow).
  - Bảng 6 bậc điện và nước bọc trong `overflow-x-auto scrollbar-thin` có nhãn gợi ý cảm ứng `← Vuốt ngang để xem đầy đủ →`.
- **Bộ Kiểm thử Đầy đủ 253 Tests**:
  - Đạt **253/253 unit & integration tests PASS 100%**.

---

## [0.1.0] - 2026-09-10

### Added
- **Khung cấu trúc dự án FOSS chuẩn mực**:
  - Khởi tạo cây thư mục chức năng phân tầng: `core/` (engine tính toán), `tests/` (kiểm thử tự động), `backend/app/` (FastAPI backend), `frontend/` (React frontend), `scripts/` (công cụ quản trị).
  - Bổ sung file đánh dấu `.gitkeep` tại tất cả các thư mục rỗng để đảm bảo Git theo dõi đầy đủ.
- **Giấy phép mã nguồn mở**:
  - Ban hành toàn văn giấy phép **MIT License** chuẩn OSI-approved tại file `LICENSE` với thông tin bản quyền: `Copyright (c) 2026 tro. Contributors`.
- **Cấu hình loại trừ Git (`.gitignore`)**:
  - Thiết lập bộ quy tắc loại trừ hoàn chỉnh cho hệ sinh thái Python (`__pycache__/`, `*.py[cod]`, `.venv/`, `.pytest_cache/`), Node/Web (`node_modules/`, `dist/`, `.env.local`), cơ sở dữ liệu & nhật ký runtime (`*.db`, `*.sqlite3`, `*.log`), và cấu hình IDE / hệ điều hành (`.vscode/`, `.idea/`, `Thumbs.db`, `.DS_Store`).
- **Công cụ quản lý & kiểm tra License Header (`scripts/add_license_headers.py`)**:
  - Xây dựng script bằng 100% Python Standard Library, không phụ thuộc gói ngoài.
  - Tự động quét và phát hiện file mã nguồn (`.py`, `.sh`, `.js`, `.ts`, `.tsx`, `.css`) thiếu License Header.
  - Tự động chèn khối comment MIT License Header tương ứng theo chuẩn ngôn ngữ (`#` cho Python/Shell và `/* ... */` cho JS/TS/CSS).
  - Hỗ trợ cờ `--check` phục vụ quy trình CI/CD và kiểm tra tuân thủ trước khi commit (exit code `0` khi hợp lệ, `1` khi phát hiện vi phạm).
  - Tự động bỏ qua các thư mục rác và thư mục hệ thống: `.git`, `node_modules`, `.venv`, `dist`, `__pycache__`, `document`.
  - Bảo toàn Shebang line, khai báo mã hóa PEP 263, định dạng dòng CRLF/LF và bảng mã ký tự.
- **Bộ kiểm thử đơn vị cơ sở (`tests/test_license_headers.py`)**:
  - Xây dựng bộ test toàn diện gồm 34 trường hợp kiểm thử cho công cụ License Header, bao gồm kiểm tra phát hiện thiếu header, chèn header, xử lý UTF-8 BOM, non-UTF-8 encodings, CRLF/LF preservation, và CLI exit code.
- **Bộ tài liệu dự án FOSS khởi đầu**:
  - Bổ sung `README.md` toàn diện với căn cứ pháp lý (QĐ 1279/QĐ-BCT, TT 60/2025/TT-BCT, NĐ 133/2026/NĐ-CP, NQ 204/2025/QH15), sơ đồ kiến trúc, hướng dẫn cài đặt trên máy sạch và hướng dẫn chạy kiểm thử.
  - Bổ sung `CONTRIBUTING.md` hướng dẫn đóng góp chuẩn mực cho cộng đồng FOSS.
  - Bổ sung `CHANGELOG.md` theo chuẩn Keep a Changelog.
