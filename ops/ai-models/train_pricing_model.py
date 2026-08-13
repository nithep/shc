import os
import numpy as np
import tensorflow as tf

print("TensorFlow Version:", tf.__version__)

def generate_mock_data(samples=1000):
    """
    Generate mock data for Hotel ECS Dynamic Pricing.
    Features: [occupancy_rate (0.0-1.0), hour_of_day (0-23), is_weekend (0 or 1), room_type_id (1-3)]
    Output: price_multiplier (0.8 - 2.0)
    """
    np.random.seed(42)
    
    occupancy_rate = np.random.uniform(0.0, 1.0, samples)
    hour_of_day = np.random.uniform(0, 23, samples)
    is_weekend = np.random.randint(0, 2, samples)
    room_type_id = np.random.randint(1, 4, samples)
    
    # Calculate target based on rules (similar to the dummy logic)
    y = np.ones(samples)
    
    # Increase price if occupancy is high
    y += np.where(occupancy_rate > 0.8, 0.2, 0.0)
    y += np.where(occupancy_rate > 0.9, 0.2, 0.0)
    
    # Increase price on weekends
    y += np.where(is_weekend == 1, 0.15, 0.0)
    
    # Late night walk-in discount
    y -= np.where((hour_of_day >= 22) | (hour_of_day <= 2), 0.2, 0.0)
    
    # Base multiplier constraints
    y = np.clip(y, 0.8, 2.0)
    
    # Add some random noise
    noise = np.random.normal(0, 0.05, samples)
    y = np.clip(y + noise, 0.8, 2.0)
    
    X = np.column_stack((occupancy_rate, hour_of_day, is_weekend, room_type_id))
    
    return X, y

def build_and_train_model():
    print("Generating mock dataset...")
    X_train, y_train = generate_mock_data(2000)
    
    print("Building a simple Neural Network...")
    # Very small model for Edge Device
    model = tf.keras.Sequential([
        tf.keras.layers.Dense(8, activation='relu', input_shape=(4,)),
        tf.keras.layers.Dense(4, activation='relu'),
        tf.keras.layers.Dense(1, activation='linear')
    ])
    
    model.compile(optimizer='adam', loss='mse', metrics=['mae'])
    
    print("Training model...")
    model.fit(X_train, y_train, epochs=50, batch_size=32, verbose=1)
    
    return model

def export_to_tflite(model, output_filename="pricing_model.tflite"):
    print(f"Exporting model to {output_filename}...")
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    tflite_model = converter.convert()

    with open(output_filename, 'wb') as f:
        f.write(tflite_model)
    
    print(f"Successfully saved {output_filename} (Size: {len(tflite_model)} bytes)")

if __name__ == "__main__":
    model = build_and_train_model()
    
    # Save the file to the current directory
    output_path = "pricing_model.tflite"
    export_to_tflite(model, output_path)
    
    print("Done! The model is ready to be copied to the edge-agent.")
