using UnityEngine;

public class HeadTracker : MonoBehaviour
{
    public Transform head;

    void Update()
    {
        if (head == null)
            return;

        Vector3 rotation = head.localEulerAngles;

        float pitch = NormalizeAngle(rotation.x);
        float yaw = NormalizeAngle(rotation.y);
        float roll = NormalizeAngle(rotation.z);

        Debug.Log(
            $"HEAD | Yaw: {yaw:F1}° | Pitch: {pitch:F1}° | Roll: {roll:F1}°"
        );
    }

    float NormalizeAngle(float angle)
    {
        if (angle > 180f)
            angle -= 360f;

        return angle;
    }
}