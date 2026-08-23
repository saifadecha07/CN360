using UnityEngine;
using UnityEngine.InputSystem;

public class MouseHeadSimulator : MonoBehaviour
{
    public float sensitivity = 0.15f;

    private float yaw = 0f;
    private float pitch = 0f;

    void Update()
    {
        if (Mouse.current == null)
            return;

        if (Mouse.current.leftButton.isPressed)
        {
            Vector2 delta = Mouse.current.delta.ReadValue();

            yaw += delta.x * sensitivity;
            pitch -= delta.y * sensitivity;

            pitch = Mathf.Clamp(pitch, -60f, 60f);

            transform.localRotation =
                Quaternion.Euler(pitch, yaw, 0f);
        }
    }
}