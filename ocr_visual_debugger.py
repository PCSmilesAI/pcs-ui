import cv2
import pytesseract
import pandas as pd
import argparse
import os

def debug_ocr_image(image_path: str, out_csv: str, out_img: str):
    image = cv2.imread(image_path)
    d = pytesseract.image_to_data(image, output_type=pytesseract.Output.DATAFRAME)
    d = d.dropna().reset_index(drop=True)

    # Save raw OCR output to CSV
    d.to_csv(out_csv, index=False)
    print(f"✅ OCR data saved to: {out_csv}")

    # Draw bounding boxes for each word
    for i, row in d.iterrows():
        (x, y, w, h) = (int(row['left']), int(row['top']), int(row['width']), int(row['height']))
        text = row['text']
        if int(row['conf']) > 30:
            cv2.rectangle(image, (x, y), (x + w, y + h), (0, 255, 0), 1)
            cv2.putText(image, text, (x, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)

    cv2.imwrite(out_img, image)
    print(f"🖼️ Annotated image saved to: {out_img}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image_path", help="Path to PNG image of invoice")
    parser.add_argument("--out_csv", default="ocr_output.csv")
    parser.add_argument("--out_img", default="ocr_debug_overlay.png")
    args = parser.parse_args()

    debug_ocr_image(args.image_path, args.out_csv, args.out_img)

if __name__ == "__main__":
    main()
