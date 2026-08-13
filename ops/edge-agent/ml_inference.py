import os
import logging
import numpy as np
from datetime import datetime

# Attempt to import tflite_runtime, fallback to full tensorflow if not available on dev machine
try:
    import tflite_runtime.interpreter as tflite
    TFLITE_AVAILABLE = True
except ImportError:
    try:
        import tensorflow as tf
        tflite = tf.lite
        TFLITE_AVAILABLE = True
    except ImportError:
        TFLITE_AVAILABLE = False

logger = logging.getLogger('ML_Inference')
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] [ML_Inference] %(message)s')

class DynamicPricingModel:
    """
    Edge Inference Engine for Dynamic Pricing.
    Runs locally on Pi Zero 2 W using TensorFlow Lite.
    """
    
    def __init__(self, model_path="pricing_model.tflite"):
        self.model_path = model_path
        self.interpreter = None
        self.input_details = None
        self.output_details = None
        self.is_loaded = False
        
        self.load_model()

    def load_model(self):
        if not TFLITE_AVAILABLE:
            logger.warning("TensorFlow Lite runtime not found. Using fallback Dummy Inference.")
            return

        if not os.path.exists(self.model_path):
            logger.warning(f"Model file {self.model_path} not found. Using fallback Dummy Inference.")
            return

        try:
            self.interpreter = tflite.Interpreter(model_path=self.model_path)
            self.interpreter.allocate_tensors()
            self.input_details = self.interpreter.get_input_details()
            self.output_details = self.interpreter.get_output_details()
            self.is_loaded = True
            logger.info(f"Successfully loaded TFLite model: {self.model_path}")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")

    def get_features(self, current_occupancy_rate, room_type_id):
        """
        Extract features for the ML model.
        Features expected by the model (Example):
        [occupancy_rate, hour_of_day, is_weekend, room_type_id]
        """
        now = datetime.now()
        hour = now.hour
        is_weekend = 1.0 if now.weekday() >= 5 else 0.0
        
        # Normalize features if necessary (depends on Vertex AI training pipeline)
        features = np.array([[
            current_occupancy_rate, 
            float(hour), 
            is_weekend, 
            float(room_type_id)
        ]], dtype=np.float32)
        
        return features

    def predict_price(self, current_occupancy_rate, room_type_id=1, base_price=1000.0):
        """
        Run inference to predict optimal dynamic price.
        """
        if not self.is_loaded:
            return self._dummy_inference(current_occupancy_rate, base_price)

        try:
            features = self.get_features(current_occupancy_rate, room_type_id)
            
            # Set input tensor
            self.interpreter.set_tensor(self.input_details[0]['index'], features)
            
            # Run inference
            self.interpreter.invoke()
            
            # Get output tensor (multiplier for base price)
            output_data = self.interpreter.get_tensor(self.output_details[0]['index'])
            price_multiplier = output_data[0][0]
            
            # Ensure multiplier is within safe bounds (e.g., 0.8x to 2.0x)
            price_multiplier = max(0.8, min(2.0, price_multiplier))
            
            final_price = base_price * price_multiplier
            logger.info(f"Inference Result -> Multiplier: {price_multiplier:.2f}, Final Price: {final_price:.2f}")
            return round(final_price, 2)
            
        except Exception as e:
            logger.error(f"Inference failed: {e}. Falling back to base price.")
            return base_price

    def _dummy_inference(self, current_occupancy_rate, base_price):
        """
        Rule-based fallback when model is not available.
        Simulates dynamic pricing behavior.
        """
        now = datetime.now()
        multiplier = 1.0
        
        # Increase price if occupancy is high
        if current_occupancy_rate > 0.8:
            multiplier += 0.2
        elif current_occupancy_rate > 0.9:
            multiplier += 0.4
            
        # Increase price on weekends
        if now.weekday() >= 5:
            multiplier += 0.15
            
        # Late night walk-in discount
        if now.hour >= 22 or now.hour <= 2:
            multiplier -= 0.2
            
        final_price = base_price * multiplier
        logger.info(f"[Dummy Model] Occupancy: {current_occupancy_rate:.2f}, Multiplier: {multiplier:.2f}, Final Price: {final_price:.2f}")
        return round(final_price, 2)

if __name__ == "__main__":
    # Test the Inference Engine
    model = DynamicPricingModel()
    
    print("Testing Fallback/Dummy Inference for different scenarios:")
    print("1. Low occupancy, weekday afternoon:")
    model.predict_price(current_occupancy_rate=0.3, base_price=800)
    
    print("\n2. High occupancy (85%), weekend:")
    # We can't mock datetime easily here without extra libs, but the dummy will use real time.
    model.predict_price(current_occupancy_rate=0.85, base_price=800)
