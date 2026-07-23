import sys, json
sys.stdout.write(json.dumps([{"timestamp": [0.0, 5.0], "text": "This is a test narration for the first chunk."}, {"timestamp": [5.0, 9.0], "text": "And here is the second chunk to make it longer."}]) + "\n")
