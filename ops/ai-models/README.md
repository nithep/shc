# AI Models (Vertex AI / Edge AI)

โฟลเดอร์นี้ใช้สำหรับจัดการโมเดล Machine Learning ในโครงการ Hotel ECS Hybrid Edge

## การทำงานแบบประหยัด (Lightweight Mode)
ตามคำแนะนำ "เรียบง่ายและประหยัด process" โมเดลเบื้องต้นจะถูกออกแบบให้เทรนบนเครื่องคอมพิวเตอร์ทั่วไป (Local) แทนการรันบน Cloud Vertex AI เพื่อประหยัดค่าใช้จ่ายและเวลาในการประมวลผล

### วิธีการสร้างโมเดล (Local Training)
1. ติดตั้งไลบรารี: `pip install -r requirements.txt`
2. รันสคริปต์เทรนโมเดล: `python train_pricing_model.py`
3. สคริปต์จะสร้างไฟล์ `pricing_model.tflite` (TensorFlow Lite) 
4. นำไฟล์ `.tflite` ไปวางไว้ในโฟลเดอร์ `/edge-agent` บน Raspberry Pi Zero 2 W เพื่อเริ่มใช้งานระบบ AI ออฟไลน์

*หมายเหตุ: หากไม่มีไฟล์โมเดล TFLite ใน `/edge-agent` ระบบ Edge Agent จะทำงานด้วยระบบ Rule-based Dummy Inference อัตโนมัติ เพื่อป้องกันระบบล่ม*
