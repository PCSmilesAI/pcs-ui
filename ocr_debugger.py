from PIL import Image
import pytesseract

img = Image.open("converted/epic_invoice_6_page-1.png")
text = pytesseract.image_to_string(img)

with open("ocr_output.txt", "w") as f:
    f.write(text)

print("✅ OCR complete. Check ocr_output.txt")
