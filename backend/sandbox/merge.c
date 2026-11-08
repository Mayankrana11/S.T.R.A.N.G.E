#include <stdio.h>
#include <stdlib.h>
#include <time.h>

// Merge function to merge two sorted subarrays
void merge(int arr[], int l, int m, int r) {
    int n1 = m - l + 1;
    int n2 = r - m;
    
    // Create temporary arrays
    int* left = (int*)malloc(n1 * sizeof(int));
    int* right = (int*)malloc(n2 * sizeof(int));
    
    // Copy data to temporary arrays
    for (int i = 0; i < n1; i++)
        left[i] = arr[l + i];
    for (int j = 0; j < n2; j++)
        right[j] = arr[m + 1 + j];
    
    // Merge the temp arrays back into arr[l...r]
    int i = 0, j = 0;
    int k = l;
    
    while (i < n1 && j < n2) {
        if (left[i] <= right[j]) {
            arr[k] = left[i];
            i++;
        } else {
            arr[k] = right[j];
            j++;
        }
        k++;
    }
    
    // Copy remaining elements of left[] if any
    while (i < n1) {
        arr[k] = left[i];
        i++;
        k++;
    }
    
    // Copy remaining elements of right[] if any
    while (j < n2) {
        arr[k] = right[j];
        j++;
        k++;
    }
    
    // Free allocated memory
    free(left);
    free(right);
}

// Recursive merge sort function
void merge_sort(int arr[], int l, int r) {
    if (l >= r)
        return;
    
    int m = l + (r - l) / 2;
    
    // Sort first half
    merge_sort(arr, l, m);
    
    // Sort second half
    merge_sort(arr, m + 1, r);
    
    // Merge the sorted halves
    merge(arr, l, m, r);
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
    
    // Perform merge sort
    printf("Sorting...");
    merge_sort(arr, 0, n - 1);
    printf(" Done.\n");
    
    printf("Sorted array: ");
    print_array(arr, n);
    
    return 0;
}
