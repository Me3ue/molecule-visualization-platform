from ultralytics import YOLO
import cv2
import numpy as np
import json
import time
from collections import defaultdict
import os

# ==================== 你的摄像头配置 ====================
RTSP_URL = "rtsp://admin:hit123456@192.168.31.125:554/stream1"
FIXED_WIDTH = 1280
DET_CONF = 0.12
STATION_FILE = "stations.json"
DRAW_WINDOW = "Draw"
MONITOR_WINDOW = "Monitor"

# ==================== 模型加载 ====================
model = YOLO("yolov8s.pt")

# ==================== 摄像头初始化 ====================
cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

def reconnect_camera():
    global cap
    cap.release()
    time.sleep(1)
    cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)

# ==================== 点在多边形内判断 ====================
def point_in_polygon(point, polygon):
    x, y = point
    inside = False
    n = len(polygon)
    p1x, p1y = polygon[0]
    for i in range(n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y) and y <= max(p1y, p2y):
            if p1y != p2y:
                xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y + 1e-6) + p1x
            if p1x == p2x or x <= xinters:
                inside = not inside
        p1x, p1y = p2x, p2y
    return inside

# ==================== 时间格式化 ====================
def format_time(sec):
    m, s = divmod(int(sec), 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"

# ==================== 显示缩放辅助 ====================
def get_display_transform(frame_shape, window_name, fallback_width=FIXED_WIDTH):
    h, w = frame_shape[:2]
    target_w = fallback_width

    try:
        _, _, win_w, win_h = cv2.getWindowImageRect(window_name)
        if win_w > 0 and win_h > 0:
            target_w = win_w
            scale_h = win_h / h
            scale_w = target_w / w
            scale = min(scale_w, scale_h)
        else:
            scale = target_w / w
    except cv2.error:
        scale = target_w / w

    scale = max(scale, 1e-6)
    disp_w = max(1, int(w * scale))
    disp_h = max(1, int(h * scale))
    return scale, disp_w, disp_h

# ==================== 绘制工位 ====================
def draw_stations():
    current_points = []
    saved_stations = []
    scale = 1.0
    frame_w, frame_h = 1, 1

    cv2.namedWindow(DRAW_WINDOW, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(DRAW_WINDOW, FIXED_WIDTH, int(FIXED_WIDTH * 9 / 16))
    print("左键 = 画绿点 | N = 保存 | R = 重置当前 | T = 清空全部 | S = 进入监控")

    def mouse(event, x, y, flags, param):
        nonlocal current_points, scale, frame_w, frame_h
        if event == cv2.EVENT_LBUTTONDOWN:
            ox = int(np.clip(x / scale, 0, frame_w - 1))
            oy = int(np.clip(y / scale, 0, frame_h - 1))
            current_points.append((ox, oy))

    cv2.setMouseCallback(DRAW_WINDOW, mouse)

    while True:
        ret, frame = cap.read()
        if not ret:
            reconnect_camera()
            continue

        # 画面倒置
        frame = cv2.flip(frame, -1)

        h, w = frame.shape[:2]
        frame_w, frame_h = w, h
        scale, disp_w, disp_h = get_display_transform(frame.shape, DRAW_WINDOW)
        show = cv2.resize(frame, (disp_w, disp_h))

        for poly in saved_stations:
            pts = (np.array(poly) * scale).astype(int)
            cv2.polylines(show, [pts], True, (255, 0, 0), 2)

        for (px, py) in current_points:
            cx = int(px * scale)
            cy = int(py * scale)
            cv2.circle(show, (cx, cy), 6, (0, 255, 0), -1)

        if len(current_points) >= 3:
            cur_pts = (np.array(current_points) * scale).astype(int)
            cv2.polylines(show, [cur_pts], True, (0, 255, 0), 2)

        cv2.imshow(DRAW_WINDOW, show)
        key = cv2.waitKey(1) & 0xFF

        if key == ord('n'):
            if len(current_points) >= 4:
                saved_stations.append(current_points.copy())
                current_points.clear()
        elif key == ord('r'):
            current_points.clear()
        elif key == ord('t'):
            saved_stations.clear()
            current_points.clear()
        elif key == ord('s'):
            with open(STATION_FILE, 'w') as f:
                json.dump(saved_stations, f)
            cv2.destroyAllWindows()
            return saved_stations
        elif key == 27:
            break

    cv2.destroyAllWindows()
    return []

# ==================== 监控 ====================
def monitor(stations):
    if not stations:
        print("未设置工位，请先输入 1 绘制工位")
        return

    cv2.namedWindow(MONITOR_WINDOW, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(MONITOR_WINDOW, FIXED_WIDTH, int(FIXED_WIDTH * 9 / 16))

    total_time = defaultdict(float)
    enter_time = [None] * len(stations)

    while True:
        ret, frame = cap.read()
        if not ret:
            reconnect_camera()
            continue

        # 画面倒置
        frame = cv2.flip(frame, -1)

        h, w = frame.shape[:2]
        scale, disp_w, disp_h = get_display_transform(frame.shape, MONITOR_WINDOW)
        show = cv2.resize(frame, (disp_w, disp_h))

        for poly in stations:
            pts = (np.array(poly) * scale).astype(int)
            cv2.polylines(show, [pts], True, (255, 0, 0), 2)

        results = model(frame, classes=[0], conf=DET_CONF, verbose=False)
        in_station = [False] * len(stations)
        detected_boxes = []

        for r in results:
            for box in r.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                detected_boxes.append((x1, y1, x2, y2, cx, cy))

        for (x1, y1, x2, y2, cx, cy) in detected_boxes:
            cv2.rectangle(show, (int(x1 * scale), int(y1 * scale)),
                          (int(x2 * scale), int(y2 * scale)), (0, 255, 0), 2)
            for i, poly in enumerate(stations):
                if point_in_polygon((cx, cy), poly):
                    in_station[i] = True
                    break

        now = time.time()
        for i in range(len(stations)):
            if in_station[i]:
                if enter_time[i] is None:
                    enter_time[i] = now
            else:
                if enter_time[i] is not None:
                    total_time[i] += now - enter_time[i]
                    enter_time[i] = None

        y = 30
        for i in range(len(stations)):
            t = total_time[i]
            if enter_time[i] is not None:
                t += now - enter_time[i]
            cv2.putText(show, f"工位{i+1} {format_time(t)}",
                        (15, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            y += 26

        cv2.imshow(MONITOR_WINDOW, show)
        if cv2.waitKey(1) & 0xFF == 27:
            break

    cap.release()
    cv2.destroyAllWindows()

# ==================== 主程序 ====================
if __name__ == "__main__":
    print("1 = 绘制工位")
    print("2 = 启动监控")
    c = input("输入 1/2: ")
    if c == "1":
        stations = draw_stations()
        if stations:
            monitor(stations)
    elif c == "2":
        # 自动判断文件是否存在
        if os.path.exists(STATION_FILE):
            with open(STATION_FILE) as f:
                stations = json.load(f)
            monitor(stations)
        else:
            print("错误：未找到工位文件，请先输入 1 绘制工位！")