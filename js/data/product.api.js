class ProductAPI {

async getProduct(barcode){

try{

const response = await fetch(
`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
)

const data = await response.json()

if(data.status === 1){

return {

name: data.product.product_name || "Unknown product",

image: data.product.image_front_small_url || ""

}

}

return null

}catch(e){

console.error("Product API error", e)

return null

}

}

}

window.productAPI = new ProductAPI()