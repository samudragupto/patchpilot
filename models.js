
const API_KEY = process.env.WATSONX_API_KEY;
const URL = "https://eu-de.ml.cloud.ibm.com/ml/v1/foundation_model_specs?version=2023-05-29";

const res = await fetch(URL, {
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    Accept: "application/json"
  }
});

const data = await res.json();
console.log(JSON.stringify(data, null, 2));