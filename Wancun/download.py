import os
import urllib.request

# 设置你的 tessdata 文件夹路径，例如：
# destination_folder = r"C:\Program Files\Tesseract-OCR\tessdata"
destination_folder = r"D:\Applications\Spiders\Wancun\.venv\Lib\site-packages\tesseract_data" # 示例路径，请替换为你实际想存放的位置

if not os.path.exists(destination_folder):
    os.makedirs(destination_folder)

url = "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata"
file_path = os.path.join(destination_folder, "eng.traineddata")

print(f"正在下载 eng.traineddata 到 {file_path} ...")
urllib.request.urlretrieve(url, file_path)
print("下载完成！")
