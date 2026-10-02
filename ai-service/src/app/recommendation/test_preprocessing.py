from preprocessing import prepare_data


products, interactions = prepare_data(
    "products.csv",
    "user_item_summary.csv"
)

print("===== PRODUCTS =====")
print(products.head())

print("\n===== INTERACTIONS =====")
print(interactions.head())

print("\nProduct shape:", products.shape)
print("Interaction shape:", interactions.shape)