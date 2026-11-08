#include <stdio.h>
#include <stdlib.h>
#include <time.h>

// Bubble sort function
void bubble_sort(int arr[], int n) {
    int i, j, temp;
    
    // Traverse through all array elements
    for (i = 0; i < n - 1; i++) {
        // Flag to ensure that the last n-i+1 element is sorted
        // and we don't need to scan those elements in every iteration
        
        // Last i elements are already in place
        for (j = 0; j < n - i - 1; j++) {
            // Traverse the array, comparing two adjacent elements
            // Swap if the current element is greater than its next element
            if (arr[j] > arr[j + 1]) {
                temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}

// Function to print an array
void print_array(int arr[], int n) {
    for (int i = 0; i < n; i++) {
        printf("%d ", arr[i]);
    }
    printf("\n");
}

// Function to generate random numbers
void generate_random(int arr[], int size, int max_val) {
    srand(time(NULL));
    for (int i = 0; i < size; i++) {
        arr[i] = rand() % max_val;
    }
}

int main() {
    // Example array with random values
    int arr[] = {64, 34, 25, 12, 22, 11, 90};
    int n = sizeof(arr) / sizeof(arr[0]);
    
    printf("Original array: ");
    print_array(arr, n);
    
    // Generate random array for demonstration
    generate_random(arr, n, 100);
    printf("Random array: ");
    print_array(arr, n);
    
    // Perform bubble sort
    printf("Sorting...");
    bubble_sort(arr, n);
    printf(" Done.\n");
    
    printf("Sorted array: ");
    print_array(arr, n);
    
    return 0;
}
